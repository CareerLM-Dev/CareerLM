import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../api/supabaseClient";
import bcrypt from "bcryptjs";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { AlertCircle } from "lucide-react";

function Auth({ onLoginSuccess, onRegisterSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
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

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-primary">
      <div className="w-full max-w-md">
        <Card className="bg-card/95 backdrop-blur-xl border-border/20 shadow-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_25px_50px_rgba(0,0,0,0.15)]">
          <CardHeader className="text-center space-y-2">
            <CardTitle className="text-3xl font-bold text-primary">
              {isLogin ? "Welcome Back" : "Create Account"}
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground">
              {isLogin ? "Sign in to your account" : "Join us today"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
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
                      className="h-12 transition-all duration-300 focus:scale-[1.01] focus:-translate-y-0.5"
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
                      className="flex h-12 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-all duration-300 focus:scale-[1.01] focus:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                        className="h-12 transition-all duration-300 focus:scale-[1.01] focus:-translate-y-0.5"
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
                  className="h-12 transition-all duration-300 focus:scale-[1.01] focus:-translate-y-0.5"
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
                  className="h-12 transition-all duration-300 focus:scale-[1.01] focus:-translate-y-0.5"
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
                className="w-full h-12 text-base font-semibold bg-primary hover:opacity-90 hover:-translate-y-0.5 shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-300"
              >
                {isLogin ? "Sign In" : "Create Account"}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col items-center pt-5 border-t border-border">
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
  );
}

export default Auth;
