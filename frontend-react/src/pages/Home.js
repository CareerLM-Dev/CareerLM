"use client";
import { useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { Button } from "../components/ui/button";
import { 
  Zap, 
  ArrowRight, 
  BarChart3, 
  Target, 
  TrendingUp, 
  FileText, 
  Search, 
  Mic, 
  Mail, 
  BookOpen, 
  LayoutDashboard,
  Sparkles,
  CheckCircle2,
  ArrowUpRight
} from "lucide-react";

function Home() {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useUser();

  const features = [
    {
      icon: FileText,
      title: "Resume Optimizer",
      description: "AI-powered resume analysis and optimization for maximum impact",
      color: "from-blue-500 to-cyan-500"
    },
    {
      icon: Search,
      title: "Skill Gap Analyzer",
      description: "Identify missing skills and get personalized learning recommendations",
      color: "from-violet-500 to-purple-500"
    },
    {
      icon: Mic,
      title: "Mock Interview",
      description: "Practice with AI-powered interviews tailored to your target role",
      color: "from-pink-500 to-rose-500"
    },
    {
      icon: Mail,
      title: "Cold Email Generator",
      description: "Create compelling outreach emails that get responses",
      color: "from-amber-500 to-orange-500"
    },
    {
      icon: BookOpen,
      title: "Study Planner",
      description: "Structured learning paths to develop in-demand skills",
      color: "from-emerald-500 to-teal-500"
    },
    {
      icon: LayoutDashboard,
      title: "Dashboard",
      description: "Track your progress and visualize your career growth",
      color: "from-indigo-500 to-blue-600"
    }
  ];

  // const stats = [
  //   { value: "10K+", label: "Active Users", suffix: "" },
  //   { value: "95", label: "Success Rate", suffix: "%" },
  //   { value: "24/7", label: "AI Support", suffix: "" }
  // ];

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Animated Background Gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-4 py-20" id="home">
        <div className="container mx-auto grid lg:grid-cols-2 gap-16 items-center relative z-10">
          <div className="space-y-8 max-w-2xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-full text-sm font-medium text-primary backdrop-blur-sm">
              <Sparkles className="w-4 h-4" />
              <span>Your Career Journey Starts Here</span>
            </div>

            {/* Headline */}
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight">
              Optimize your career with{" "}
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                CareerLM
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-xl text-muted-foreground leading-relaxed max-w-xl">
              Resume optimizer, skill gap analyzer, mock interview, cold email
              generator, study planner, and dashboard — all in one AI-powered platform.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-4">
              {!loading && isAuthenticated ? (
                <Button 
                  size="lg" 
                  onClick={() => navigate("/home")} 
                  className="group bg-gradient-to-r from-primary to-primary/90 hover:shadow-lg hover:shadow-primary/25 transition-all duration-300"
                >
                  <span>Go to Dashboard</span>
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              ) : (
                <>
                  <Button 
                    size="lg" 
                    onClick={() => navigate("/auth?mode=signup")} 
                    className="group bg-gradient-to-r from-primary to-primary/90 hover:shadow-lg hover:shadow-primary/25 transition-all duration-300"
                  >
                    <span>Get Started Free</span>
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                  <Button 
                    size="lg" 
                    variant="outline" 
                    onClick={() => navigate("/auth")}
                    className="border-2 hover:bg-accent/50 transition-all duration-300"
                  >
                    <span>Sign In</span>
                  </Button>
                </>
              )}
            </div>

            {/* Stats */}
            {/* <div className="flex flex-wrap gap-12 pt-8 border-t border-border/50">
              {stats.map((stat, index) => (
                <div key={index} className="space-y-1">
                  <div className="text-4xl font-bold bg-gradient-to-br from-primary to-primary/60 bg-clip-text text-transparent">
                    {stat.value}{stat.suffix}
                  </div>
                  <div className="text-sm text-muted-foreground font-medium">{stat.label}</div>
                </div>
              ))}
            </div> */}
          </div>

          {/* Hero Visual */}
          <div className="relative hidden lg:block h-[600px]">
            {/* Floating Cards with Glassmorphism */}
            <div className="absolute top-10 left-10 animate-float">
              <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl p-5 shadow-2xl shadow-primary/10 flex items-center gap-4 hover:scale-105 transition-transform duration-300">
                <div className="bg-gradient-to-br from-primary to-primary/70 p-3 rounded-xl shadow-lg">
                  <BarChart3 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="font-semibold text-lg">Analytics</div>
                  <div className="text-sm text-muted-foreground">Real-time insights</div>
                </div>
              </div>
            </div>

            <div className="absolute top-32 right-5 animate-float-delayed">
              <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl p-5 shadow-2xl shadow-secondary/10 flex items-center gap-4 hover:scale-105 transition-transform duration-300">
                <div className="bg-gradient-to-br from-secondary to-secondary/70 p-3 rounded-xl shadow-lg">
                  <Target className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="font-semibold text-lg">Goals</div>
                  <div className="text-sm text-muted-foreground">Track milestones</div>
                </div>
              </div>
            </div>

            <div className="absolute bottom-40 left-20 animate-float">
              <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl p-5 shadow-2xl shadow-accent/10 flex items-center gap-4 hover:scale-105 transition-transform duration-300">
                <div className="bg-gradient-to-br from-amber-500 to-orange-500 p-3 rounded-xl shadow-lg">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="font-semibold text-lg">Fast Results</div>
                  <div className="text-sm text-muted-foreground">AI-powered speed</div>
                </div>
              </div>
            </div>

            {/* Center Decorative Element */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-full blur-3xl" />
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="py-24 px-4 relative" id="about">
        <div className="absolute inset-0 bg-gradient-to-b from-muted/30 via-background to-background" />
        <div className="container mx-auto relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-secondary/10 border border-secondary/20 rounded-full text-sm font-medium text-secondary">
              <CheckCircle2 className="w-4 h-4" />
              <span>About Us</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
              Empowering Your{" "}
              <span className="bg-gradient-to-r from-secondary to-secondary/70 bg-clip-text text-transparent">
                Career Journey
              </span>
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              CareerLM is your comprehensive career assistant, combining
              cutting-edge AI technology with proven career development strategies
              to help you achieve your professional goals.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Zap,
                title: "AI-Powered",
                description: "Advanced algorithms analyze your profile and provide personalized recommendations",
                gradient: "from-blue-500 to-cyan-500"
              },
              {
                icon: TrendingUp,
                title: "Data-Driven",
                description: "Make informed decisions with comprehensive analytics and insights",
                gradient: "from-violet-500 to-purple-500"
              },
              {
                icon: Target,
                title: "Goal-Oriented",
                description: "Set and track your career milestones with our structured approach",
                gradient: "from-pink-500 to-rose-500"
              }
            ].map((item, index) => (
              <div 
                key={index} 
                className="group bg-card border border-border rounded-2xl p-8 hover:shadow-2xl hover:shadow-primary/5 hover:border-primary/20 transition-all duration-500 relative overflow-hidden"
              >
                <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${item.gradient} opacity-5 rounded-bl-full group-hover:opacity-10 transition-opacity duration-500`} />
                <div className={`bg-gradient-to-br ${item.gradient} w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  <item.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold mb-3 group-hover:text-primary transition-colors duration-300">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-4" id="features">
        <div className="container mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 border border-accent/20 rounded-full text-sm font-medium text-accent-foreground">
              <Sparkles className="w-4 h-4" />
              <span>Features</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
              Everything You Need to{" "}
              <span className="bg-gradient-to-r from-accent-foreground to-accent-foreground/70 bg-clip-text text-transparent">
                Succeed
              </span>
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Comprehensive tools designed to accelerate your career growth and
              help you stand out in today's competitive market.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="group relative bg-card border border-border rounded-2xl p-6 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all duration-500 cursor-pointer overflow-hidden"
              >
                {/* Hover Gradient Background */}
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-5 transition-opacity duration-500`} />
                
                <div className="relative z-10">
                  <div className={`bg-gradient-to-br ${feature.color} w-14 h-14 rounded-xl flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                    <feature.icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-bold mb-3 group-hover:text-primary transition-colors duration-300">{feature.title}</h3>
                  <p className="text-muted-foreground mb-6 leading-relaxed">{feature.description}</p>
                  <div className="flex items-center text-primary font-medium group-hover:gap-3 gap-2 transition-all duration-300">
                    <span>Learn more</span>
                    <ArrowUpRight className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform duration-300" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-24 px-4 relative" id="contact">
        <div className="absolute inset-0 bg-gradient-to-t from-muted/30 via-background to-background" />
        <div className="container mx-auto relative z-10">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/5 via-background to-secondary/5 border border-border p-8 md:p-16">
            {/* Decorative Elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-secondary/10 rounded-full blur-3xl" />
            
            <div className="relative z-10 max-w-4xl mx-auto">
              <div className="text-center mb-12 space-y-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-sm font-medium text-primary">
                  <Mail className="w-4 h-4" />
                  <span>Get in Touch</span>
                </div>
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
                  Ready to Transform Your{" "}
                  <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    Career?
                  </span>
                </h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                  Have questions or need support? Our team is here to help you
                  succeed every step of the way.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6 mb-12">
                <div className="flex items-center gap-5 bg-card/80 backdrop-blur-sm border border-border rounded-2xl p-6 hover:border-primary/30 hover:shadow-lg transition-all duration-300 group">
                  <div className="bg-gradient-to-br from-primary to-primary/70 w-14 h-14 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <Mail className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground font-medium mb-1">Email</div>
                    <div className="font-semibold text-lg">support@careerLM.com</div>
                  </div>
                </div>

                <div className="flex items-center gap-5 bg-card/80 backdrop-blur-sm border border-border rounded-2xl p-6 hover:border-secondary/30 hover:shadow-lg transition-all duration-300 group">
                  <div className="bg-gradient-to-br from-secondary to-secondary/70 w-14 h-14 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground font-medium mb-1">Phone</div>
                    <div className="font-semibold text-lg">+91 12345 67890</div>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <Button 
                  size="lg" 
                  onClick={() => navigate("/auth")}
                  className="bg-gradient-to-r from-primary to-primary/90 hover:shadow-xl hover:shadow-primary/25 transition-all duration-300 px-8"
                >
                  Start Your Journey
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="container mx-auto text-center text-muted-foreground">
          <p>© 2024 CareerLM. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

export default Home;