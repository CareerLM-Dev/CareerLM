"use client";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Zap, ArrowRight, BarChart3, Target, TrendingUp } from "lucide-react";

function Home() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-4 py-20" id="home">
        <div className="container mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-sm text-primary">
              <Zap className="w-4 h-4" />
              <span>Your Career Journey Starts Here</span>
            </div>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-tight">
              Optimize your career with{" "}
              <span className="text-primary">
                CareerLM
              </span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl">
              Resume optimizer, skill gap analyzer, mock interview, cold email
              generator, study planner, and dashboard — all in one platform.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button size="lg" onClick={() => navigate("/auth")} className="group">
                <span>Get Started</span>
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/auth")}>
                <span>Sign In</span>
              </Button>
            </div>
            <div className="flex flex-wrap gap-8 pt-8">
              <div className="space-y-1">
                <div className="text-3xl font-bold text-primary">10K+</div>
                <div className="text-sm text-muted-foreground">Users</div>
              </div>
              <div className="space-y-1">
                <div className="text-3xl font-bold text-primary">95%</div>
                <div className="text-sm text-muted-foreground">Success Rate</div>
              </div>
              <div className="space-y-1">
                <div className="text-3xl font-bold text-primary">24/7</div>
                <div className="text-sm text-muted-foreground">Support</div>
              </div>
            </div>
          </div>
          <div className="relative hidden lg:block">
            <div className="relative w-full h-[600px]">
              <div className="absolute top-20 left-10 animate-float">
                <div className="bg-card border border-border rounded-lg p-4 shadow-lg flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-md">
                    <BarChart3 className="w-6 h-6 text-primary" />
                  </div>
                  <span className="font-medium">Analytics</span>
                </div>
              </div>
              <div className="absolute top-40 right-10 animate-float-delayed">
                <div className="bg-card border border-border rounded-lg p-4 shadow-lg flex items-center gap-3">
                  <div className="bg-secondary/10 p-2 rounded-md">
                    <Target className="w-6 h-6 text-secondary" />
                  </div>
                  <span className="font-medium">Goals</span>
                </div>
              </div>
              <div className="absolute bottom-40 left-20 animate-float">
                <div className="bg-card border border-border rounded-lg p-4 shadow-lg flex items-center gap-3">
                  <div className="bg-accent/10 p-2 rounded-md">
                    <Zap className="w-6 h-6 text-accent-foreground" />
                  </div>
                  <span className="font-medium">Fast Results</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="py-20 px-4 bg-muted/30" id="about">
        <div className="container mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-block px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-sm text-primary mb-4">
              About Us
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Empowering Your Career Journey</h2>
            <p className="text-lg text-muted-foreground">
              CareerLM is your comprehensive career assistant, combining
              cutting-edge AI technology with proven career development strategies
              to help you achieve your professional goals.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-card border border-border rounded-lg p-8 hover:shadow-lg transition-shadow">
              <div className="bg-primary/10 w-16 h-16 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">AI-Powered</h3>
              <p className="text-muted-foreground">
                Advanced algorithms analyze your profile and provide
                personalized recommendations
              </p>
            </div>
            <div className="bg-card border border-border rounded-lg p-8 hover:shadow-lg transition-shadow">
              <div className="bg-secondary/10 w-16 h-16 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="w-8 h-8 text-secondary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Data-Driven</h3>
              <p className="text-muted-foreground">
                Make informed decisions with comprehensive analytics and
                insights
              </p>
            </div>
            <div className="bg-card border border-border rounded-lg p-8 hover:shadow-lg transition-shadow">
              <div className="bg-accent/10 w-16 h-16 rounded-lg flex items-center justify-center mb-4">
                <Target className="w-8 h-8 text-accent-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Goal-Oriented</h3>
              <p className="text-muted-foreground">
                Set and track your career milestones with our structured
                approach
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4" id="features">
        <div className="container mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-block px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-sm text-primary mb-4">
              Features
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Everything You Need to Succeed</h2>
            <p className="text-lg text-muted-foreground">
              Comprehensive tools designed to accelerate your career growth and
              help you stand out in today's competitive market.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="group bg-card border border-border rounded-lg p-6 hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer">
              <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Resume Optimizer</h3>
              <p className="text-muted-foreground mb-4">
                AI-powered resume analysis and optimization for maximum impact
              </p>
              <div className="text-primary group-hover:translate-x-1 transition-transform inline-block">→</div>
            </div>
            <div className="group bg-card border border-border rounded-lg p-6 hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer">
              <div className="bg-secondary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Skill Gap Analyzer</h3>
              <p className="text-muted-foreground mb-4">
                Identify missing skills and get personalized learning
                recommendations
              </p>
              <div className="text-primary group-hover:translate-x-1 transition-transform inline-block">→</div>
            </div>
            <div className="group bg-card border border-border rounded-lg p-6 hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer">
              <div className="bg-accent/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-accent-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Mock Interview</h3>
              <p className="text-muted-foreground mb-4">
                Practice with AI-powered interviews tailored to your target role
              </p>
              <div className="text-primary group-hover:translate-x-1 transition-transform inline-block">→</div>
            </div>
            <div className="group bg-card border border-border rounded-lg p-6 hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer">
              <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Cold Email Generator</h3>
              <p className="text-muted-foreground mb-4">Create compelling outreach emails that get responses</p>
              <div className="text-primary group-hover:translate-x-1 transition-transform inline-block">→</div>
            </div>
            <div className="group bg-card border border-border rounded-lg p-6 hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer">
              <div className="bg-secondary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Study Planner</h3>
              <p className="text-muted-foreground mb-4">Structured learning paths to develop in-demand skills</p>
              <div className="text-primary group-hover:translate-x-1 transition-transform inline-block">→</div>
            </div>
            <div className="group bg-card border border-border rounded-lg p-6 hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer">
              <div className="bg-accent/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="w-6 h-6 text-accent-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Dashboard</h3>
              <p className="text-muted-foreground mb-4">Track your progress and visualize your career growth</p>
              <div className="text-primary group-hover:translate-x-1 transition-transform inline-block">→</div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-20 px-4 bg-muted/30" id="contact">
        <div className="container mx-auto">
          <div className="bg-primary/5 border border-border rounded-2xl p-8 md:p-12">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <div className="inline-block px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-sm text-primary mb-4">
                  Get in Touch
                </div>
                <h2 className="text-4xl md:text-5xl font-bold mb-4">Ready to Transform Your Career?</h2>
                <p className="text-lg text-muted-foreground">
                  Have questions or need support? Our team is here to help you
                  succeed.
                </p>
              </div>
              <div className="grid md:grid-cols-2 gap-6 mb-8">
                <div className="flex items-center gap-4 bg-card border border-border rounded-lg p-6">
                  <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Email</div>
                    <div className="font-medium">support@careerLM.com</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 bg-card border border-border rounded-lg p-6">
                  <div className="bg-secondary/10 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Phone</div>
                    <div className="font-medium">+91 12345 67890</div>
                  </div>
                </div>
              </div>
              <div className="text-center">
                <Button size="lg" onClick={() => navigate("/auth")}>
                  Start Your Journey
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Home;
