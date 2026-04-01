import { Navigate } from "react-router-dom";
import { useUser } from "../context/UserContext";

/**
 * ProtectedRoute
 *
 * Wraps any route that requires an authenticated session.
 *
 * Behaviour:
 *  - While UserContext is still hydrating from localStorage → show a
 *    full-screen spinner (avoids a flash-redirect on page refresh).
 *  - Once hydrated, if there is no valid session → redirect to /auth.
 *  - If authenticated → render children normally.
 *
 * Usage in App.js:
 *   <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
 */
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useUser();

  // Still resolving session from localStorage — don't redirect yet
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // No session — bounce to /auth, preserving the intended destination
  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return children;
}

export default ProtectedRoute;
