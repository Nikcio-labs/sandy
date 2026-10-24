use super::is_allowed_origin;

fn url(raw: &str) -> tauri::Url {
    raw.parse().unwrap()
}

#[test]
fn allows_the_production_app_origins() {
    for raw in [
        // macOS/Linux custom protocol origin.
        "tauri://localhost/",
        // Windows custom protocol origins.
        "http://tauri.localhost/",
        "https://tauri.localhost/",
        // Deep paths and query strings on the app origin stay allowed.
        "tauri://localhost/index.html?next=/settings",
    ] {
        assert!(is_allowed_origin(&url(raw)), "should allow {raw}");
    }
}

#[test]
fn allows_the_dev_server_origin_only_in_debug_builds() {
    let dev = url("http://localhost:1420/index.html");
    assert_eq!(is_allowed_origin(&dev), cfg!(debug_assertions));
}

#[test]
fn rejects_remote_origins() {
    for raw in [
        "https://evil.example/login",
        "http://evil.example:8080/",
        "tauri://evil.example/",
        "file:///etc/passwd",
        "data:text/html,<h1>hi</h1>",
        "about:blank",
    ] {
        assert!(!is_allowed_origin(&url(raw)), "should reject {raw}");
    }
}

#[test]
fn rejects_lookalike_origins() {
    for raw in [
        // Host is compared exactly, so suffix and subdomain spoofs fail.
        "http://tauri.localhost.evil.example/",
        "http://evil-tauri.localhost/",
        "tauri://localhost.evil.example/",
        // The dev port is part of the origin: other ports are remote.
        "http://localhost:1421/",
        // Scheme spoofing the dev server must not pass.
        "https://localhost:1420/",
    ] {
        assert!(!is_allowed_origin(&url(raw)), "should reject {raw}");
    }
}
