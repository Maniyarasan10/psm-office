from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Capture all console messages and network responses
    console_msgs = []
    page.on("console", lambda msg: console_msgs.append(f"CONSOLE: {msg.text}"))

    failed_requests = []
    page.on("requestfailed", lambda req: failed_requests.append(f"FAILED: {req.url} {req.failure}"))

    response_401s = []
    page.on("response", lambda resp: response_401s.append(f"RESPONSE {resp.status}: {resp.url}") if resp.status == 401 else None)

    # Navigate to login page
    page.goto("https://psm-office.problemsolvingmind.com/login", wait_until="networkidle")

    # Fill in login credentials
    page.fill('input[placeholder*="admin username"]', 'psmoffice')
    page.fill('input[placeholder*="password"]', '$solution01')

    # Click sign in
    page.click('button:has-text("Sign In")')

    # Wait for navigation
    page.wait_for_timeout(3000)

    print("Current URL:", page.url)
    print("Console messages:", console_msgs[:10])
    print("401 responses:", response_401s[:10])
    print("Failed requests:", failed_requests[:5])

    # Check cookies
    cookies = context.cookies()
    print("Cookies:", cookies)

    # Try to access dashboard
    page.goto("https://psm-office.problemsolvingmind.com/", wait_until="networkidle")
    print("After dashboard URL:", page.url)
    print("401 responses after dashboard:", response_401s[:10])

    browser.close()
