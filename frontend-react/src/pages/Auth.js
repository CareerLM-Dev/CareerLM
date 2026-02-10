import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../api/supabaseClient";
import bcrypt from "bcryptjs";
import "./Auth.css";

function Auth({ onLoginSuccess, onRegisterSuccess }) {
  const [isLogin, setIsLogin] = useState(true); // toggle between login/signup
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("student");
  const [currentCompany, setCurrentCompany] = useState("");
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      if (isLogin) {
        // LOGIN
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          console.error("Login error:", error);
          // Provide user-friendly error messages
          if (error.message.includes("Invalid login credentials")) {
            throw new Error(
              "Invalid email or password. Please check your credentials and try again.",
            );
          } else if (error.message.includes("Email not confirmed")) {
            throw new Error(
              "Please confirm your email address before logging in.",
            );
          } else {
            throw error;
          }
        }

        console.log("Login successful:", data);
        onLoginSuccess && onLoginSuccess(data);
        navigate("/dashboard");
      } else {
        // REGISTER
        const hashedPassword = await bcrypt.hash(password, 10);

        const { data: authData, error: authError } = await supabase.auth.signUp(
          {
            email,
            password,
          },
        );

        if (authError) {
          console.error("Signup error:", authError);
          throw authError;
        }

        console.log("Signup successful:", authData);

        // Check if email confirmation is required
        if (authData.user && !authData.session) {
          throw new Error(
            "Registration successful! Please check your email to confirm your account before logging in.",
          );
        }

        const { error: dbError } = await supabase.from("user").insert([
          {
            id: authData.user.id,
            name,
            email,
            password: hashedPassword,
            status,
            current_company: status === "professional" ? currentCompany : null,
            questionnaire_answered: false,
            questionnaire_answers: null,
          },
        ]);

        if (dbError) {
          console.error("Database insert error:", dbError);
          throw dbError;
        }

        // auto-login after registration (only if email confirmation is not required)
        if (authData.session) {
          onRegisterSuccess && onRegisterSuccess(authData);
          // Redirect to onboarding for students, dashboard for professionals
          if (status === "student") {
            navigate(`/onboarding/${authData.user.id}`);
          } else {
            navigate("/dashboard");
          }
        } else {
          setError(
            "Registration successful! Please check your email to confirm your account.",
          );
          setIsLogin(true); // Switch to login view
        }
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1 className="auth-title">
              {isLogin ? "Welcome Back" : "Create Account"}
            </h1>
            <p className="auth-subtitle">
              {isLogin ? "Sign in to your account" : "Join us today"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {!isLogin && (
              <>
                <div className="input-group">
                  <input
                    type="text"
                    placeholder="Enter your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="auth-input"
                  />
                </div>
                <div className="input-group">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="auth-input"
                  >
                    <option value="student">Student</option>
                    <option value="professional">Professional</option>
                  </select>
                </div>
                {status === "professional" && (
                  <div className="input-group">
                    <input
                      type="text"
                      placeholder="Enter your company"
                      value={currentCompany}
                      onChange={(e) => setCurrentCompany(e.target.value)}
                      required
                      className="auth-input"
                    />
                  </div>
                )}
              </>
            )}

            <div className="input-group">
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="auth-input"
              />
            </div>
            <div className="input-group">
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="auth-input"
              />
            </div>

            {error && <p className="error">{error}</p>}

            <button type="submit" className="auth-button">
              {isLogin ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div className="auth-toggle">
            <p className="toggle-text">
              {isLogin ? "Don't have an account?" : "Already have an account?"}
            </p>
            <button
              type="button"
              className="toggle-button"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? "Sign Up" : "Sign In"} here
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Auth;
