/**
 * Utility functions to parse projects and experience text into structured arrays
 */

// ── Shared date patterns (full + abbreviated month names) ─────────────────

const MONTH_PATTERN =
  '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*';

const DATE_RANGE_PATTERN = new RegExp(
  `(${MONTH_PATTERN}[\\s.]*\\d{4}\\s*[–—-]\\s*(?:Present|${MONTH_PATTERN}[\\s.]*\\d{4})|\\d{4}\\s*[–—-]\\s*(?:Present|\\d{4}))`,
  'i'
);

const DATE_RANGE_END_PATTERN = new RegExp(
  `(${MONTH_PATTERN}[\\s.]*\\d{4}(?:\\s*[–—-]\\s*(?:Present|${MONTH_PATTERN}[\\s.]*\\d{4}))?|\\d{4}\\s*[–—-]\\s*(?:Present|\\d{4}))$`,
  'i'
);

const DATE_POINT_PATTERN = new RegExp(
  `(${MONTH_PATTERN}[\\s.]*\\d{4}|\\d{4})`,
  'i'
);

// ── Normalizer ────────────────────────────────────────────────────────────

/**
 * Normalize raw backend text before parsing into structured objects.
 */
function normalizeForParsing(text) {
  if (!text) return '';

  // Convert literal escaped newlines from storage into real lines.
  let normalized = text
    .replace(/\\n/g, '\n')
    .replace(/\\u2013/g, '–')
    .replace(/\\u2014/g, '—')
    .replace(/\\u223c/g, '∼');

  // 1. Strip ALL CAPS section headers
  // Matches lines like "TECHNICAL PROJECTS", "PROFESSIONAL EXPERIENCE", "TECHNICAL SKILLS"
  normalized = normalized.replace(/^[A-Z][A-Z\s&/]{2,}[A-Z]\s*\n/gm, '');

  // 2. For projects: merge standalone date line onto previous pipe-separated title line
  normalized = normalized.replace(
    new RegExp(
      `(\\|[^\\n]+)\\n(${MONTH_PATTERN}[^\\n]*)`,
      'gi'
    ),
    '$1 $2'
  );

  // 3. For experience: merge standalone date range onto previous non-bullet line
  normalized = normalized.replace(
    new RegExp(
      `([^\\n•\\-–*►▪▸]+)\\n(${MONTH_PATTERN}[\\s.]*\\d{4}\\s*[–—-]\\s*(?:Present|${MONTH_PATTERN}[\\s.]*\\d{4})[^\\n]*)`,
      'gi'
    ),
    '$1 $2'
  );

  // 4. Collapse 3+ consecutive newlines to 2
  normalized = normalized.replace(/\n{3,}/g, '\n\n');

  return normalized.trim();
}

function appendWithSpace(base, addition) {
  const left = (base || '').trim();
  const right = (addition || '').trim();
  if (!right) return left;
  return left ? `${left} ${right}` : right;
}

function parseProjectHeaderLine(line) {
  const pipeIndex = line.indexOf('|');
  let titlePart = '';
  let restPart = '';

  if (pipeIndex >= 0) {
    titlePart = line.substring(0, pipeIndex).trim();
    restPart = line.substring(pipeIndex + 1).trim();
  } else {
    // Fallback: headers like "Dociffy – Document Tool Aug 2025 — Link"
    // (no pipe separator, date embedded in same line).
    const dateMatch = line.match(DATE_RANGE_PATTERN) || line.match(DATE_POINT_PATTERN);
    if (!dateMatch) return null;

    const dateText = dateMatch[1];
    const dateIndex = line.indexOf(dateText);
    titlePart = line.substring(0, dateIndex).trim();
    restPart = line.substring(dateIndex).trim();
  }

  let title = titlePart;
  let description = '';
  const titleDescMatch = titlePart.match(/^(.+?)\s*[–—-]\s*(.+)$/);
  if (titleDescMatch) {
    title = titleDescMatch[1].trim();
    description = titleDescMatch[2].trim();
  }

  let techStack = '';
  let links = '';
  let date = '';

  if (restPart) {
    const linkMatches = restPart.match(/\[([^\]]+)\]/g);
    if (linkMatches) {
      links = linkMatches
        .map((l) => l.replace(/[\]\[]/g, '').trim())
        .filter(Boolean)
        .join(', ');
    }

    let remaining = restPart.replace(/\[([^\]]+)\]/g, '').trim();

    // Strict date-at-end first, then loose first date span fallback.
    const dateAtEnd = remaining.match(DATE_RANGE_END_PATTERN);
    if (dateAtEnd) {
      date = dateAtEnd[1].trim();
      remaining = remaining.substring(0, dateAtEnd.index).trim();
    } else {
      const looseDate = remaining.match(
        new RegExp(
          `${MONTH_PATTERN}[\\s.]*\\d{4}(?:\\s*[–—-]\\s*(?:Present|${MONTH_PATTERN}[\\s.]*\\d{4}))?`,
          'i'
        )
      );
      if (looseDate) {
        date = looseDate[0].trim();
        remaining = remaining.replace(looseDate[0], '').trim();
      }
    }
    techStack = remaining;
  }

  if (!title && description) {
    title = description;
    description = '';
  }

  return { title, description, techStack, links, date, bullets: [] };
}

function parseProjectsFlattened(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned.includes('|')) return [];

  // Split by likely project starts: "Title – Desc | ..."
  const segments = cleaned
    .split(/(?=\b[A-Z][A-Za-z0-9&().,'+\-/\s]{1,80}\s[–—-]\s[^|]{2,120}\s\|)/)
    .map((s) => s.trim())
    .filter(Boolean);

  const projects = [];

  for (const segment of segments) {
    if (!segment.includes('|')) continue;

    // Split header from bullets using first action-like bullet marker.
    const bulletStart = segment.search(
      /\s[–—-]\s(?=(Built|Developed|Integrated|Designed|Optimized|Processed|Added|Reduced|Worked|Created|Implemented|Led|Managed|Analyzed)\b)/i
    );

    const header = (bulletStart > 0 ? segment.slice(0, bulletStart) : segment).trim();
    const body = (bulletStart > 0 ? segment.slice(bulletStart) : '').trim();

    const parsed = parseProjectHeaderLine(header);
    if (!parsed) continue;

    if (body) {
      const bulletParts = body
        .replace(/^[-–—•*]\s*/, '')
        .split(/\s*[–—•*]\s+/)
        .map((b) => b.trim())
        .filter(Boolean)
        .filter((b) => !b.includes('|') && b.length > 6);
      parsed.bullets = bulletParts;
    }

    projects.push(parsed);
  }

  return projects;
}

// ── Projects ──────────────────────────────────────────────────────────────

/**
 * Parse projects text into an array of project objects.

 */
export function parseProjects(projectsText) {
  if (!projectsText || typeof projectsText !== 'string') return [];

  let text = normalizeForParsing(projectsText.trim());

  // Strip leading "projects" header word if still present after normalization
  text = text.replace(/^projects\s*/i, '').trim();

  const lines = text.split('\n');
  const projects = [];
  let currentProject = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Bullet point detection
    const isBullet = /^[*\-–—•►▪▸·]\s/.test(line);

    // Project title line can be either pipe-separated or no-pipe with date.
    const maybeHeader = !isBullet && (
      line.includes('|') ||
      DATE_RANGE_PATTERN.test(line) ||
      DATE_POINT_PATTERN.test(line)
    );
    if (maybeHeader) {
      if (currentProject) {
        projects.push(currentProject);
      }

      const parsedHeader = parseProjectHeaderLine(line);
      if (parsedHeader) {
        currentProject = parsedHeader;
      }
    } else if (isBullet && currentProject) {
      const bulletText = line.replace(/^[*\-–—•►▪▸·]\s*/, '').trim();
      if (bulletText) {
        currentProject.bullets.push(bulletText);
      }
    } else if (currentProject) {
      // Continuation line: preserve wrapped text instead of dropping it.
      if (currentProject.bullets && currentProject.bullets.length > 0) {
        const lastIndex = currentProject.bullets.length - 1;
        currentProject.bullets[lastIndex] = appendWithSpace(
          currentProject.bullets[lastIndex],
          line
        );
      } else if (line.includes('|')) {
        // Rare wrapped header case; merge into header metadata.
        const reparsed = parseProjectHeaderLine(
          `${currentProject.title}${currentProject.description ? ` – ${currentProject.description}` : ''} | ${appendWithSpace(currentProject.techStack, line)}`
        );
        if (reparsed) {
          currentProject = {
            ...currentProject,
            techStack: reparsed.techStack || currentProject.techStack,
            links: reparsed.links || currentProject.links,
            date: reparsed.date || currentProject.date,
          };
        }
      } else {
        currentProject.description = appendWithSpace(currentProject.description, line);
      }
    }
  }

  if (currentProject) {
    projects.push(currentProject);
  }

  if (projects.length <= 1 && !text.includes('\n')) {
    const flatProjects = parseProjectsFlattened(text);
    if (flatProjects.length > 0) return flatProjects;
  }

  return projects;
}

function parseExperienceFlattened(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const dateRegex = new RegExp(DATE_RANGE_PATTERN.source, 'gi');
  const ranges = [];
  let m;
  while ((m = dateRegex.exec(cleaned)) !== null) {
    ranges.push({ start: m.index, end: dateRegex.lastIndex, date: m[1] });
  }
  if (ranges.length === 0) return [];

  const experiences = [];
  for (let i = 0; i < ranges.length; i++) {
    const cur = ranges[i];
    const prevEnd = i === 0 ? 0 : ranges[i - 1].end;
    const nextStart = i + 1 < ranges.length ? ranges[i + 1].start : cleaned.length;

    const titleChunk = cleaned.slice(prevEnd, cur.start).trim();
    const body = cleaned.slice(cur.end, nextStart).trim();
    if (!titleChunk) continue;

    const bulletParts = body
      .replace(/^[-–—•*]\s*/, '')
      .split(/\s*[–—•*]\s+/)
      .map((b) => b.trim())
      .filter(Boolean)
      .filter((b) => b.length > 6);

    experiences.push({
      title: titleChunk,
      company: '',
      location: '',
      dateRange: cur.date.trim(),
      bullets: bulletParts,
    });
  }

  return experiences;
}

// ── Experience ────────────────────────────────────────────────────────────

/**
 * Parse experience text into an array of experience objects.
 */
export function parseExperience(experienceText) {
  if (!experienceText || typeof experienceText !== 'string') return [];

  let text = normalizeForParsing(experienceText.trim());

  // Strip leading "experience" header word if still present
  text = text.replace(/^(?:professional\s+)?experience\s*/i, '').trim();

  const lines = text.split('\n');
  const experiences = [];
  let currentExperience = null;
  let expectingCompany = false;

  // Date pattern for recognizing title lines — supports full month names
  const titleDatePattern = new RegExp(
    `\\b(${MONTH_PATTERN}[\\s.]*\\d{4}\\s*[–—-]\\s*(?:(?:${MONTH_PATTERN})[\\s.]*\\d{4}|Present)|\\d{4}\\s*[–—-]\\s*(?:\\d{4}|Present))`,
    'i'
  );

  // Full match pattern to extract title and date from same line
  const titleExtractPattern = new RegExp(
    `^(.+?)\\s+((?:${MONTH_PATTERN})[\\s.]*\\d{4}\\s*[–—-]\\s*(?:(?:${MONTH_PATTERN})[\\s.]*\\d{4}|Present)|\\d{4}\\s*[–—-]\\s*(?:\\d{4}|Present))$`,
    'i'
  );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const isBullet = /^[*\-–—•►▪▸]\s/.test(line);

    if (titleDatePattern.test(line) && !isBullet) {
      // Save previous experience
      if (currentExperience) {
        experiences.push(currentExperience);
      }

      const match = line.match(titleExtractPattern);

      if (match) {
        const [, title, dateRange] = match;
        currentExperience = {
          title: title.trim(),
          company: '',
          location: '',
          dateRange: dateRange.trim(),
          bullets: [],
        };
        expectingCompany = true;
      }
    } else if (expectingCompany && currentExperience && !isBullet) {
      // Company line — try to split out location
      const parts = line.split(/\s{2,}|\t/);
      if (parts.length > 1) {
        currentExperience.company = parts[0].trim();
        currentExperience.location = parts.slice(1).join(' ').trim();
      } else {
        // Comma fallback
        const commaParts = line.split(',');
        if (commaParts.length > 1) {
          currentExperience.company = commaParts[0].trim();
          currentExperience.location = commaParts.slice(1).join(',').trim();
        } else {
          currentExperience.company = line;
          currentExperience.location = '';
        }
      }
      expectingCompany = false;
    } else if (isBullet && currentExperience) {
      const bulletText = line.replace(/^[*\-–—•►▪▸]\s*/, '').trim();
      if (bulletText) {
        currentExperience.bullets.push(bulletText);
      }
    } else if (currentExperience) {
      // Continuation line: merge into previous bullet when available.
      if (currentExperience.bullets && currentExperience.bullets.length > 0) {
        const lastIndex = currentExperience.bullets.length - 1;
        currentExperience.bullets[lastIndex] = appendWithSpace(
          currentExperience.bullets[lastIndex],
          line
        );
      } else if (!currentExperience.company) {
        currentExperience.company = line;
      } else {
        currentExperience.company = appendWithSpace(currentExperience.company, line);
      }
    }
  }

  if (currentExperience) {
    experiences.push(currentExperience);
  }

  if (experiences.length <= 1 && !text.includes('\n')) {
    const flatExperiences = parseExperienceFlattened(text);
    if (flatExperiences.length > 0) return flatExperiences;
  }

  return experiences;
}

// ── Serializers ───────────────────────────────────────────────────────────

/**
 * Convert projects array back to text format for saving.
 */
export function serializeProjects(projects) {
  if (!projects || projects.length === 0) return '';

  return projects
    .map((p) => {
      let titleLine = p.title || 'Untitled Project';

      if (p.description) {
        titleLine += ` – ${p.description}`;
      }

      if (p.techStack || p.links || p.date) {
        titleLine += ' |';

        if (p.techStack) {
          titleLine += ` ${p.techStack}`;
        }

        if (p.links) {
          const linkParts = p.links
            .split(',')
            .map((l) => l.trim())
            .filter(Boolean);
          linkParts.forEach((link) => {
            titleLine += ` [${link}]`;
          });
        }

        if (p.date) {
          titleLine += ` ${p.date}`;
        }
      }

      const bulletLines = (p.bullets || [])
        .filter(Boolean)
        .map((b) => `– ${b}`)
        .join('\n');

      return bulletLines ? `${titleLine}\n${bulletLines}` : titleLine;
    })
    .join('\n');
}

/**
 * Convert experience array back to text format for saving.
 */
export function serializeExperience(experiences) {
  if (!experiences || experiences.length === 0) return '';

  return experiences
    .map((e) => {
      const titleLine = `${e.title || 'Untitled Position'} ${e.dateRange || ''}`.trim();
      const companyLine = e.location
        ? `${e.company}  ${e.location}`
        : e.company || '';
      const bulletLines = (e.bullets || [])
        .filter(Boolean)
        .map((b) => `– ${b}`)
        .join('\n');

      if (bulletLines) {
        return companyLine
          ? `${titleLine}\n${companyLine}\n${bulletLines}`
          : `${titleLine}\n${bulletLines}`;
      }
      return companyLine ? `${titleLine}\n${companyLine}` : titleLine;
    })
    .join('\n');
}