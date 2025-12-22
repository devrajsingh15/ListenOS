export default function Home() {
  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>ListenOS API Server</h1>
      <p>This server provides API endpoints for the ListenOS desktop application.</p>
      <h2>Endpoints</h2>
      <ul>
        <li><code>GET /api/auth/callback</code> - OAuth callback</li>
        <li><code>GET /api/auth/session</code> - Get user session</li>
        <li><code>GET /api/users/me</code> - Get current user</li>
        <li><code>PATCH /api/users/me</code> - Update user settings</li>
        <li><code>GET /api/subscriptions</code> - Get subscription</li>
      </ul>
    </div>
  );
}
