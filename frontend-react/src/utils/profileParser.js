/**
 * Utility functions to parse projects and experience text into structured arrays
 */

/**
 * Parse projects text into an array of project objects
 * Expected format:
 * ProjectName – Description | Tech Stack [Links] Date
 * – Bullet point 1
 * – Bullet point 2
 */
export function parseProjects(projectsText) {
  if (!projectsText || typeof projectsText !== 'string') return [];
  
  // Remove "Projects" header if present
  let text = projectsText.trim();
  if (text.toLowerCase().startsWith('projects')) {
    text = text.replace(/^projects\s*/i, '').trim();
  }
  
  // Split by lines
  const lines = text.split('\n');
  const projects = [];
  let currentProject = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Check if this is a bullet point (starts with *, –, -, •, or similar)
    const isBullet = /^[*\-–—•►▪▸]\s/.test(line);
    
    // Check if this is a project title line (has " | " and doesn't start with bullet)
    if (line.includes(' | ') && !isBullet) {
      // Save previous project if exists
      if (currentProject) {
        projects.push(currentProject);
      }
      
      // Parse project line: "Title – Description | Tech Stack [Link1] [Link2] Date"
      // Split by pipe first to separate title from rest
      const pipeIndex = line.indexOf(' | ');
      const titlePart = line.substring(0, pipeIndex).trim();
      const restPart = line.substring(pipeIndex + 3).trim();
      
      // Parse title and description (split by various dash characters)
      let title = titlePart;
      let description = '';
      const titleDescMatch = titlePart.match(/^(.+?)\s*[–—-]\s*(.+)$/);
      if (titleDescMatch) {
        title = titleDescMatch[1].trim();
        description = titleDescMatch[2].trim();
      }
      
      // Parse rest: tech stack, links, and date
      let techStack = '';
      let links = '';
      let date = '';
      
      if (restPart) {
        // Extract all bracketed items as links
        const linkMatches = restPart.match(/\[([^\]]+)\]/g);
        if (linkMatches) {
          links = linkMatches.map(l => l.replace(/[\]\[]/g, '').trim()).filter(Boolean).join(', ');
        }
        
        // Remove bracketed items to get tech stack and date
        let remaining = restPart.replace(/\[([^\]]+)\]/g, '').trim();
        
        // Extract date pattern at end (like "June 2025" or "June 2025 – Present" or "2024 - 2025")
        const dateMatch = remaining.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s.]*\d{4}(?:\s*[–—-]\s*(?:Present|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s.]*\d{4}))?|\d{4}\s*[–—-]\s*(?:Present|\d{4}))$/i);
        if (dateMatch) {
          date = dateMatch[1].trim();
          remaining = remaining.substring(0, dateMatch.index).trim();
        }
        
        // What's left is tech stack
        techStack = remaining;
      }
      
      currentProject = {
        title,
        description,
        techStack,
        links,
        date,
        bullets: []
      };
    } else if (isBullet) {
      // This is a bullet point for current project
      if (currentProject) {
        // Remove bullet marker and trim
        const bulletText = line.replace(/^[*\-–—•►▪▸]\s*/, '').trim();
        if (bulletText) {
          currentProject.bullets.push(bulletText);
        }
      }
    }
  }
  
  // Add last project
  if (currentProject) {
    projects.push(currentProject);
  }
  
  return projects;
}

/**
 * Parse experience text into an array of experience objects
 * Expected format:
 * Job Title Date Range
 * Company Name Location
 * – Bullet point 1
 * – Bullet point 2
 */
export function parseExperience(experienceText) {
  if (!experienceText || typeof experienceText !== 'string') return [];
  
  // Remove "Experience" header if present
  let text = experienceText.trim();
  if (text.toLowerCase().startsWith('experience')) {
    text = text.replace(/^experience\s*/i, '').trim();
  }
  
  const lines = text.split('\n');
  const experiences = [];
  let currentExperience = null;
  let expectingCompany = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Check if this is a bullet point
    const isBullet = /^[*\-–—•►▪▸]\s/.test(line);
    
    // Check if this is a job title line (has date pattern at end, not a bullet)
    const datePattern = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s.]*\d{4}\s*[–—-]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s.]*\d{4}|Present)|\d{4}\s*[–—-]\s*(?:\d{4}|Present)/i;
    
    if (datePattern.test(line) && !isBullet) {
      // Save previous experience if exists
      if (currentExperience) {
        experiences.push(currentExperience);
      }
      
      // Parse job title and date - be more flexible with separators
      const match = line.match(/^(.+?)\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s.]*\d{4}\s*[–—-]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s.]*\d{4}|Present)|\d{4}\s*[–—-]\s*(?:\d{4}|Present))$/i);
      
      if (match) {
        const [, title, dateRange] = match;
        currentExperience = {
          title: title.trim(),
          company: '',
          location: '',
          dateRange: dateRange.trim(),
          bullets: []
        };
        expectingCompany = true;
      }
    } else if (expectingCompany && currentExperience && !isBullet) {
      // This should be the company line
      currentExperience.company = line;
      currentExperience.location = '';
      
      // Try to extract location if present (usually after multiple spaces, tab, or comma)
      const parts = line.split(/\s{2,}|\t/);
      if (parts.length > 1) {
        currentExperience.company = parts[0].trim();
        currentExperience.location = parts.slice(1).join(' ').trim();
      } else {
        // Try comma separation as fallback
        const commaParts = line.split(',');
        if (commaParts.length > 1) {
          currentExperience.company = commaParts[0].trim();
          currentExperience.location = commaParts.slice(1).join(',').trim();
        }
      }
      expectingCompany = false;
    } else if (isBullet && currentExperience) {
      // This is a bullet point for current experience
      const bulletText = line.replace(/^[*\-–—•►▪▸]\s*/, '').trim();
      if (bulletText) {
        currentExperience.bullets.push(bulletText);
      }
    }
  }
  
  // Add last experience
  if (currentExperience) {
    experiences.push(currentExperience);
  }
  
  return experiences;
}

/**
 * Convert projects array back to text format for saving
 */
export function serializeProjects(projects) {
  if (!projects || projects.length === 0) return '';
  
  return projects.map(p => {
    // Build title line: "Title – Description | Tech Stack [Link1] [Link2] Date"
    let titleLine = p.title || 'Untitled Project';
    
    if (p.description) {
      titleLine += ` – ${p.description}`;
    }
    
    if (p.techStack || p.links || p.date) {
      titleLine += ' |';
      
      if (p.techStack) {
        titleLine += ` ${p.techStack}`;
      }
      
      // Convert comma-separated links back to bracketed format
      if (p.links) {
        const linkParts = p.links.split(',').map(l => l.trim()).filter(Boolean);
        linkParts.forEach(link => {
          titleLine += ` [${link}]`;
        });
      }
      
      if (p.date) {
        titleLine += ` ${p.date}`;
      }
    }
    
    // Use – for consistency (em dash)
    const bulletLines = (p.bullets || []).filter(Boolean).map(b => `– ${b}`).join('\n');
    return bulletLines ? `${titleLine}\n${bulletLines}` : titleLine;
  }).join('\n');
}

/**
 * Convert experience array back to text format for saving
 */
export function serializeExperience(experiences) {
  if (!experiences || experiences.length === 0) return '';
  
  return experiences.map(e => {
    const titleLine = `${e.title || 'Untitled Position'} ${e.dateRange || ''}`;
    const companyLine = e.location ? `${e.company} ${e.location}` : (e.company || '');
    // Use – for consistency (em dash)
    const bulletLines = (e.bullets || []).filter(Boolean).map(b => `– ${b}`).join('\n');
    
    if (bulletLines) {
      return `${titleLine}\n${companyLine}\n${bulletLines}`;
    } else {
      return companyLine ? `${titleLine}\n${companyLine}` : titleLine;
    }
  }).join('\n');
}
