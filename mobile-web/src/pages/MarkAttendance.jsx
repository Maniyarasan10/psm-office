import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMapPin, FiCrosshair, FiAlertCircle, FiCheckCircle, FiLoader } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { confirmAttendance, reverseGeocode } from '../services/api';

export default function MarkAttendance() {
  const navigate = useNavigate();
  const { employee, personType } = useAuth();
  const toast = useToast();
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [placeDetails, setPlaceDetails] = useState(null);
  const [locating, setLocating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const getLocation = async () => {
    setLocating(true);
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser');
      setLocating(false);
      return;
    }
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });
      const coords = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
      setLocation(coords);
      const place = await reverseGeocode(coords.latitude, coords.longitude);
      setPlaceDetails(place);
    } catch (err) {
      console.error(err);
      if (err.code === 1) {
        setLocationError('Location permission denied. Please allow location access to clock in.');
      } else {
        setLocationError('Failed to get location. Please try again.');
      }
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    getLocation();
  }, []);

  const confirmAndUpload = async () => {
    setUploading(true);
    try {
      const time = new Date().toTimeString().slice(0, 5);
      const date = new Date().toISOString().split('T')[0];

      const formData = new FormData();
      formData.append('person_id', employee._id);
      formData.append('person_type', personType);
      formData.append('time', time);
      formData.append('date', date);

      if (location) {
        formData.append('latitude', String(location.latitude));
        formData.append('longitude', String(location.longitude));
      }

      await confirmAttendance(formData);

      toast.success(
        `Clock in recorded at ${time}${
          location ? `\nGPS: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : ''
        }`
      );
      navigate('/', { replace: true });
    } catch (err) {
      console.error(err);
      toast.error('Failed to confirm attendance. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <header className="screen-header">
        <button className="header-btn" onClick={() => navigate(-1)}>
          Cancel
        </button>
        <span className="header-title">Mark Attendance</span>
        <span className="header-spacer" />
      </header>

      <div className="mark-content">
        <div className="icon-circle">
          <FiMapPin size={64} />
        </div>

        <h2 className="mark-title">GPS Location</h2>
        <p className="mark-sub">Your current location will be recorded</p>

        {location && (
          <div className="location-card">
            {placeDetails ? (
              <>
                <div className="place-row">
                  <FiMapPin size={16} color="#10b981" />
                  <span className="place-text">{placeDetails.formattedAddress}</span>
                </div>
                <div className="gps-text" style={{ textAlign: 'center', marginTop: 6 }}>
                  {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                </div>
              </>
            ) : (
              <div className="gps-text" style={{ textAlign: 'center' }}>
                {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
              </div>
            )}
          </div>
        )}

        {locationError && (
          <div className="error-card">
            <FiAlertCircle size={16} />
            <span>{locationError}</span>
          </div>
        )}

        {!location && !locationError && (
          <div className="error-card">
            <FiLoader className="spin" size={16} />
            <span>Getting your current location...</span>
          </div>
        )}

        <button
          className="btn-primary"
          style={{ maxWidth: 320, marginTop: 20 }}
          onClick={getLocation}
          disabled={locating}
        >
          <FiCrosshair size={16} />
          {locating ? 'Locating...' : 'Re-locate'}
        </button>
      </div>

      <div className="mark-footer">
        <button
          className="confirm-btn"
          onClick={confirmAndUpload}
          disabled={uploading || !location}
        >
          {uploading ? (
            <FiLoader className="spin" size={18} />
          ) : (
            <FiCheckCircle size={22} />
          )}
          Confirm Attendance
        </button>
      </div>
    </div>
  );
}
