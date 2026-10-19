"""In-process realtime broker for WebSocket pushes.

Holds the live WebSocket connections keyed by person id so request handlers can
fan out small JSON event envelopes to the people they affect. This is a
single-process, best-effort channel: it never raises into the caller's response
path and silently drops sends to connections that have gone away.

Deployment note: because the registry lives in memory, the API must run a
single worker process (the Flask dev server, or gunicorn/waitress with one
worker and multiple threads). Multiple workers would each hold their own
subset of connections and events would only reach the worker that handled them.
"""
import json
import threading


class _Broker:
    def __init__(self):
        self._lock = threading.Lock()
        self._connections = {}  # person_id -> set of websocket handles

    def register(self, person_id, ws):
        if not person_id:
            return
        with self._lock:
            self._connections.setdefault(str(person_id), set()).add(ws)

    def unregister(self, person_id, ws):
        if not person_id:
            return
        with self._lock:
            conns = self._connections.get(str(person_id))
            if not conns:
                return
            conns.discard(ws)
            if not conns:
                self._connections.pop(str(person_id), None)

    def send_to_person(self, person_id, event):
        if not person_id:
            return
        with self._lock:
            targets = list(self._connections.get(str(person_id), ()))
        if not targets:
            return
        try:
            message = json.dumps(event)
        except (TypeError, ValueError):
            return
        for ws in targets:
            try:
                ws.send(message)
            except Exception:
                self.unregister(person_id, ws)

    def broadcast(self, event):
        with self._lock:
            all_targets = [
                ws for conns in self._connections.values() for ws in conns
            ]
        if not all_targets:
            return
        try:
            message = json.dumps(event)
        except (TypeError, ValueError):
            return
        for ws in all_targets:
            try:
                ws.send(message)
            except Exception:
                pass

    def connection_count(self):
        with self._lock:
            return sum(len(conns) for conns in self._connections.values())


broker = _Broker()


def notify_event(person_id, event_type, **payload):
    """Push a ``{"type": event_type, ...}`` event to one person, if connected."""
    if not person_id:
        return
    event = {"type": event_type}
    event.update(payload)
    broker.send_to_person(person_id, event)


def notify_all(event_type, **payload):
    """Broadcast a ``{"type": event_type, ...}`` event to every connected client."""
    event = {"type": event_type}
    event.update(payload)
    broker.broadcast(event)
