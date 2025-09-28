from app import app

with app.test_client() as client:
    # Login
    response = client.post('/login', data={'username': 'demo', 'password': 'DemoPass123'}, follow_redirects=True)
    assert response.status_code == 200
    api = client.get('/api/summary')
    print(api.json)
