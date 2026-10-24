import requests

session = requests.Session()
login_resp = session.post('https://psm-office.problemsolvingmind.com/api/auth/admin-login', 
    json={'username': 'psmoffice', 'password': chr(36)+'solution01'}, 
    headers={'Origin': 'https://psm-office.problemsolvingmind.com'}, 
    timeout=15)
print('Login status:', login_resp.status_code)
print('Cookies after login:', dict(session.cookies))

resp = session.get('https://psm-office.problemsolvingmind.com/api/notifications/activity?limit=100', 
    headers={'Origin': 'https://psm-office.problemsolvingmind.com'}, 
    timeout=15)
print('Protected endpoint status:', resp.status_code)
print('Response:', resp.text[:200])
