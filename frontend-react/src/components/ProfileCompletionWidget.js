import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { FileText, Target, Zap, ArrowRight } from "lucide-react";

function ProfileCompletionWidget() {
  const navigate = useNavigate();
  const { user, session } = useUser();
  const [completionPercentage, setCompletionPercentage] = useState(0);
  const [missingItems, setMissingItems] = useState([]);

  const calculateCompletion = useCallback((profile) => {
    let completion = 0;
    const missing = [];

    const userProfile = profile.user_profile || {};
    const questionnaire = profile.questionnaire_answers || {};
    
    // Questionnaire (Status + Target Role) - 10%
    const hasQuestionnaire = questionnaire.status && questionnaire.target_role;
    if (hasQuestionnaire) {
      completion += 10;
    } else {
      missing.push({
        key: "questionnaire",
        label: "Complete Your Profile Setup",
        icon: Target,
        action: () => navigate("/profile"),
      });
    }
    
    // Resume - 35% (high priority)
    const hasResumeData = profile.has_resume === true;
    
    if (hasResumeData) {
      completion += 35;
    } else {
      missing.push({
        key: "resume",
        label: "Upload Your Resume",
        icon: FileText,
        action: () => {
          sessionStorage.setItem("fromDashboard", "true");
          navigate("/upload-resume");
        },
      });
    }

    // Projects - 15%
    const hasProjects = userProfile.projects && userProfile.projects.trim().length > 50;
    if (hasProjects) {
      completion += 15;
    } else {
      missing.push({
        key: "projects",
        label: "Add Projects",
        icon: Target,
        action: () => navigate("/profile"),
      });
    }

    // Experience - 15%
    const hasExperience = userProfile.experience && userProfile.experience.trim().length > 50;
    if (hasExperience) {
      completion += 15;
    } else {
      missing.push({
        key: "experience",
        label: "Add Work Experience",
        icon: FileText,
        action: () => navigate("/profile"),
      });
    }

    // Skills - 10%
    const hasSkills = 
      userProfile.skills && 
      Array.isArray(userProfile.skills) && 
      userProfile.skills.length > 0;
    if (hasSkills) {
      completion += 10;
    } else {
      missing.push({
        key: "skills",
        label: "Add Skills",
        icon: Zap,
        action: () => navigate("/profile"),
      });
    }

    // Education - 5%
    const hasEducation = userProfile.education && userProfile.education.trim().length > 30;
    if (hasEducation) {
      completion += 5;
    } else {
      missing.push({
        key: "education",
        label: "Add Education",
        icon: FileText,
        action: () => navigate("/profile"),
      });
    }

    // Intro/Summary - 5%
    const hasIntro = userProfile.intro && userProfile.intro.trim().length > 50;
    if (hasIntro) {
      completion += 5;
    } else {
      missing.push({
        key: "intro",
        label: "Add Professional Summary",
        icon: FileText,
        action: () => navigate("/profile"),
      });
    }

    // Areas of Interest + Expertise (both together) - 5% bonus
    const hasAreasOfInterest = 
      userProfile.areas_of_interest && 
      userProfile.areas_of_interest.trim().length > 20;
    const hasExpertise = 
      userProfile.expertise && 
      userProfile.expertise.trim().length > 20;
    
    if (hasAreasOfInterest && hasExpertise) {
      completion += 5;
    } else {
      missing.push({
        key: "areas_expertise",
        label: "Add Areas of Interest & Expertise",
        icon: Target,
        action: () => navigate("/profile"),
      });
    }

    setCompletionPercentage(completion);
    setMissingItems(missing);
  }, [navigate]);

  useEffect(() => {
    const fetchProfileData = async () => {
      if (!user?.id || !session?.access_token) return;

      try {
        // Fetch profile details
        const profileResponse = await fetch(
          "http://localhost:8000/api/v1/user/profile-details",
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        if (!profileResponse.ok) {
          console.error("Failed to fetch profile");
          return;
        }

        const profileData = await profileResponse.json();
        
        // Fetch resume history to check if user has uploaded resume
        const historyResponse = await fetch(
          "http://localhost:8000/api/v1/user/history?limit=1",
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );
        
        let hasResume = false;
        if (historyResponse.ok) {
          const historyData = await historyResponse.json();
          hasResume = historyData.success && historyData.data && historyData.data.length > 0;
        }

        if (profileData.success && profileData.data) {
          const profile = {
            ...profileData.data,
            has_resume: hasResume
          };
          calculateCompletion(profile);
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      }
    };

    fetchProfileData();
  }, [user?.id, session?.access_token, calculateCompletion]);

  // Only show if not 100% complete
  if (completionPercentage >= 100 || missingItems.length === 0) {
    return null;
  }

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Complete Your Profile</CardTitle>
            <CardDescription className="text-sm">
              {completionPercentage}% complete
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={completionPercentage} className="h-2" />

        <div className="space-y-2">
          {missingItems.slice(0, 2).map((item) => {
            const IconComponent = item.icon;
            return (
              <div
                key={item.key}
                className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <IconComponent className="h-4 w-4 text-primary opacity-70" />
                  <span className="text-sm font-medium text-foreground">
                    {item.label}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={item.action}
                  className="h-6 px-2 text-primary text-xs"
                >
                  Complete
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            );
          })}
        </div>

        {missingItems.length > 2 && (
          <Button
            variant="outline"
            className="w-full text-xs"
            onClick={() => navigate("/profile")}
          >
            View More
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default ProfileCompletionWidget;
