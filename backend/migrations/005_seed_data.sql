-- =====================================================
-- CortexHR Database Schema - Migration 005
-- Seed Data (Optional)
-- =====================================================

-- =====================================================
-- SAMPLE JOBS
-- =====================================================

INSERT INTO public.jobs (title, department, location, job_type, description, requirements, is_active)
VALUES
  (
    'Senior Software Engineer',
    'Engineering',
    'San Francisco, CA (Hybrid)',
    'Full-time',
    'We are looking for a Senior Software Engineer to join our growing team. You will work on building scalable web applications using modern technologies.',
    'Requirements:
• 5+ years of experience in software development
• Proficiency in React, TypeScript, and Node.js
• Experience with PostgreSQL or similar databases
• Strong problem-solving skills
• Excellent communication abilities',
    true
  ),
  (
    'Product Manager',
    'Product',
    'New York, NY (Remote)',
    'Full-time',
    'Join our product team to help define and execute our product strategy. You will work closely with engineering, design, and business teams.',
    'Requirements:
• 3+ years of product management experience
• Strong analytical and data-driven mindset
• Experience with agile methodologies
• Excellent stakeholder management
• Technical background preferred',
    true
  ),
  (
    'UX Designer',
    'Design',
    'Los Angeles, CA (Hybrid)',
    'Full-time',
    'We need a talented UX Designer to create intuitive and beautiful user experiences for our products.',
    'Requirements:
• 3+ years of UX/UI design experience
• Proficiency in Figma or Sketch
• Strong portfolio showcasing design process
• Experience with user research and testing
• Knowledge of design systems',
    true
  ),
  (
    'DevOps Engineer',
    'Engineering',
    'Austin, TX (Remote)',
    'Full-time',
    'Looking for a DevOps Engineer to help build and maintain our cloud infrastructure and CI/CD pipelines.',
    'Requirements:
• 4+ years of DevOps experience
• Strong knowledge of AWS services
• Experience with Kubernetes and Docker
• Proficiency in Terraform or similar IaC tools
• Scripting skills in Python or Bash',
    true
  ),
  (
    'Data Analyst',
    'Analytics',
    'Seattle, WA (Hybrid)',
    'Full-time',
    'Join our analytics team to help drive data-informed decisions across the organization.',
    'Requirements:
• 2+ years of data analysis experience
• Strong SQL skills
• Experience with Python or R
• Proficiency in Tableau or Power BI
• Excellent presentation skills',
    true
  );

-- =====================================================
-- SAMPLE APTITUDE QUESTIONS
-- =====================================================

INSERT INTO public.aptitude_questions (question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, is_active)
VALUES
  (
    'What is the time complexity of binary search?',
    'O(n)',
    'O(log n)',
    'O(n²)',
    'O(1)',
    'B',
    'algorithms',
    'medium',
    true
  ),
  (
    'Which data structure uses LIFO (Last In, First Out)?',
    'Queue',
    'Stack',
    'Array',
    'Linked List',
    'B',
    'data_structures',
    'easy',
    true
  ),
  (
    'What does SQL stand for?',
    'Structured Query Language',
    'Simple Query Language',
    'Standard Query Language',
    'System Query Language',
    'A',
    'databases',
    'easy',
    true
  ),
  (
    'In object-oriented programming, what is encapsulation?',
    'The ability of a class to inherit from multiple classes',
    'The bundling of data and methods that operate on that data within a single unit',
    'The ability to present the same interface for different data types',
    'The process of breaking down a complex problem into smaller parts',
    'B',
    'programming',
    'medium',
    true
  ),
  (
    'What is the purpose of version control systems like Git?',
    'To compile code faster',
    'To track changes in source code during software development',
    'To automatically fix bugs in code',
    'To deploy applications to production',
    'B',
    'tools',
    'easy',
    true
  );

-- =====================================================
-- SAMPLE EMAIL TEMPLATES
-- =====================================================

INSERT INTO public.email_templates (name, email_type, subject, body, is_default)
VALUES
  (
    'Application Received',
    'acknowledgment',
    'Thank you for your application - {{job_title}}',
    'Dear {{candidate_name}},

Thank you for applying for the {{job_title}} position at our company.

We have received your application and our team is currently reviewing it. We will get back to you within 5-7 business days.

If you have any questions, please don''t hesitate to reach out.

Best regards,
The HR Team',
    true
  ),
  (
    'Interview Invitation',
    'interview',
    'Interview Invitation - {{job_title}}',
    'Dear {{candidate_name}},

We are pleased to inform you that your application for {{job_title}} has been shortlisted.

We would like to invite you for an interview. Please use the link below to schedule a time that works for you:

{{interview_link}}

If you have any questions or need to reschedule, please let us know.

Best regards,
The HR Team',
    true
  ),
  (
    'Rejection',
    'rejection',
    'Update on your application - {{job_title}}',
    'Dear {{candidate_name}},

Thank you for your interest in the {{job_title}} position and for taking the time to apply.

After careful consideration, we have decided to move forward with other candidates whose qualifications more closely match our current needs.

We appreciate your interest in our company and encourage you to apply for future openings that match your skills and experience.

We wish you the best in your job search.

Best regards,
The HR Team',
    true
  );
