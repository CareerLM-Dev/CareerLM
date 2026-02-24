import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../api/supabaseClient";
import bcrypt from "bcryptjs";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { AlertCircle, Github } from "lucide-react";

function Auth({ onLoginSuccess, onRegisterSuccess }) {
  const [searchParams] = useSearchParams();
  const [isLogin, setIsLogin] = useState(searchParams.get("mode") !== "signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("student");
  const [currentCompany, setCurrentCompany] = useState("");
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  // Sync form mode when URL query param changes (e.g. back/forward navigation)
  useEffect(() => {
    setIsLogin(searchParams.get("mode") !== "signup");
  }, [searchParams]);


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

        // Check whether this user has completed onboarding.
        // Matches the same logic used in AuthCallback for OAuth logins.
        const { data: userRow } = await supabase
          .from("user")
          .select("questionnaire_answered")
          .eq("id", data.user.id)
          .single();

        if (!userRow || !userRow.questionnaire_answered) {
          // New user or one who never finished the questionnaire
          navigate(`/onboarding/${data.user.id}`);
        } else {
          navigate("/dashboard");
        }
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
          if (authError.message.includes("already") || authError.message.includes("exists")) {
            throw new Error("This email is already registered. Please sign in instead.");
          }
          throw authError;
        }

        console.log("Signup successful:", authData);

        if (authData?.user?.identities && authData.user.identities.length === 0) {
          throw new Error("This email is already registered. Please sign in instead.");
        }

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

        if (authData.session) {
          onRegisterSuccess && onRegisterSuccess(authData);
          if (status === "student") {
            navigate(`/onboarding/${authData.user.id}`);
          } else {
            navigate("/dashboard");
          }
        } else {
          setError(
            "Registration successful! Please check your email to confirm your account.",
          );
          setIsLogin(true);
        }
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleOAuthLogin = async (provider) => {
    try {
      setError(null);
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-primary">
      <div className="min-h-full flex items-center justify-center py-4 px-5">
      <div className="w-full max-w-md">
        <Card className="bg-card/95 backdrop-blur-xl border-border/20 shadow-2xl">
          <CardHeader className="text-center space-y-1 pt-5 pb-3">
            <CardTitle className="text-2xl font-bold text-primary">
              {isLogin ? "Welcome Back" : "Create Account"}
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              {isLogin ? "Sign in to your account" : "Join us today"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              {!isLogin && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium">
                      Name
                    </Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="Enter your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="h-9 transition-all duration-300"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="status" className="text-sm font-medium">
                      Status
                    </Label>
                    <select
                      id="status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="student">Student</option>
                      <option value="professional">Professional</option>
                    </select>
                  </div>
                  
                  {status === "professional" && (
                    <div className="space-y-2">
                      <Label htmlFor="company" className="text-sm font-medium">
                        Company
                      </Label>
                      <Input
                        id="company"
                        type="text"
                        placeholder="Enter your company"
                        value={currentCompany}
                        onChange={(e) => setCurrentCompany(e.target.value)}
                        required
                        className="h-9 transition-all duration-300"
                      />
                    </div>
                  )}
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-9 transition-all duration-300"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-9 transition-all duration-300"
                />
              </div>

              {error && (
                <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button 
                type="submit" 
                className="w-full h-10 text-sm font-semibold bg-primary hover:opacity-90 shadow-md shadow-primary/30 transition-all duration-300"
              >
                {isLogin ? "Sign In" : "Create Account"}
              </Button>
            </form>

            {/* Divider */}
            <div className="relative my-3">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            {/* Social Login Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-10 transition-all duration-300 hover:shadow-md"
                onClick={() => handleOAuthLogin("google")}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span className="ml-2 text-sm font-medium">Google</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 transition-all duration-300 hover:shadow-md"
                onClick={() => handleOAuthLogin("github")}
              >
                <Github className="w-5 h-5" />
                <span className="ml-2 text-sm font-medium">GitHub</span>
              </Button>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col items-center pt-3 pb-5 border-t border-border">
            <p className="text-sm text-muted-foreground mb-2">
              {isLogin ? "Don't have an account?" : "Already have an account?"}
            </p>
            <Button
              type="button"
              variant="link"
              onClick={() => setIsLogin(!isLogin)}
              className="font-semibold text-primary hover:text-primary/80 hover:bg-primary/10 px-3 py-1 rounded-md transition-all duration-200"
            >
              {isLogin ? "Sign Up" : "Sign In"} here
            </Button>
          </CardFooter>
        </Card>
      </div>
      </div>
    </div>
  );
}

export default Auth;
