# CortexHR Project Analysis

## 1. Executive Summary
CortexHR (formerly "remix-of-tara-insights-hub") is a sophisticated, serverless recruitment platform built on the **Supabase** stack. It leverages a "Heavy Edge" architecture where complex business logic (resume parsing, AI scoring, scheduling) is offloaded to **Deno Edge Functions**, keeping the **React** frontend lightweight and responsive.

### 🌟 Strengths
- **Resilient AI Architecture**: The `_shared/ai-provider.ts` module implements a robust multi-provider fallback strategy (Google -> Groq -> Mistral -> OpenAI) with specific key rotation for high-throughput providers like Groq. This is production-grade resilience.
- **Security-First Database**: Row Level Security (RLS) is enabled on all tables, with a clear RBAC (Role-Based Access Control) system distinguishing between Public, Candidates, and HR Staff.
- **Automated Workflows**: The system effectively uses Database Triggers (`auto-process-application`) to chain user actions (upload) to asynchronous backend processes (AI analysis) without blocking the UI.

### ⚠️ Areas for Improvement
- **Testing Strategy**: The project currently relies on ad-hoc scripts (`test_gemini_pdf.ts`, `repro_scoring.cjs`) rather than a comprehensive automated test suite (Jest/Vitest for frontend, Deno Test for backend).
- **Frontend Error Boundaries**: While `Login.tsx` has some error handling, a global Error Boundary strategy for the Dashboard would improve UX during edge-case failures.
- **Type Sharing**: There is some duplication of type definitions between Frontend (`src/integrations/supabase/types.ts`) and Backend. Leveraging Supabase's type generator more strictly in CI/CD would ensure better type safety.

---

## 2. Architectural Deep Dive

### Frontend (User Interface)
- **Stack**: React 18, Vite, Tailwind CSS, Shadcn UI, Framer Motion.
- **State Management**: TanStack Query (React Query) is used effectively for server-state synchronization. This is the correct choice for Supabase-heavy apps.
- **Authentication**: Native Supabase Auth with Google OAuth integration. The custom `AuthCallback.tsx` handles role assignment and token management for Google Calendar access.
- **Routing**: standard React Router v6.

### Backend (Infrastructure)
- **Database**: PostgreSQL 15+ with `pgvector` support (unused currently but ready for embeddings).
- **Logic Layer**: 19+ Edge Functions handling discrete tasks (`poll-gmail-resumes`, `schedule-interview`, `parse-resume`).
- **Orchestration**:
    - **Triggers**: `on_application_created` -> calls `auto-process-application`.
    - **Scheduled Tasks**: `poll-gmail-resumes` is designed to run on a schedule (Cron) to ingest emails.
- **External Integrations**:
    - **Google Workspace**: Deep integration for Calendar (Events/Meet) and Gmail (Read-only).
    - **Resend**: Transactional email delivery.

---

## 3. Code Quality Review

### Backend (TypeScript/Deno)
- **Modularity**: Good use of `_shared` module for common AI logic.
- **Error Handling**: Recent updates to `schedule-interview` (Poison Pill fix) show a move towards robust, non-blocking error handling.
- **Configuration**: Uses environment variables effectively. Secrets are stored securely in Supabase Vault.

### Frontend (TypeScript/React)
- **Component Design**: High usage of accessible UI components (Shadcn/Radix).
- **Responsiveness**: Tailwind classes indicate a mobile-first approach.
- **Linting**: Issues with `eslint` were noted in previous sessions but generally the code follows modern React patterns (Hooks, Functional Components).

---

## 4. Security Audit

### Data Access
- **RLS Policies**: correctly restrict access. `is_hr_staff()` function centralizes the authorization logic.
- **Storage**: The `resumes` bucket is private, accessible only via signed URLs or authenticated HR staff. Correctly configured.

### Authentication
- **Role Management**: The `Login.tsx` auto-recovery fix ensures that users cannot get into a "zombie" state without a role.
- **Tokens**: Google OAuth tokens are stored in a dedicated `hr_google_tokens` table protected by RLS (users can only see their own). *Note: Ensure encryption is considered for these tokens in `complete_schema.sql` if high security is required, though RLS provides isolation.*

---

## 5. Recommendations for Next Steps

### Immediate (High Value)
1.  **Implement CI/CD**: Set up a GitHub Action to run `supabase functions deploy` automatically on merge to `main`.
2.  **Add Testing**:
    -   Install `vitest` for the frontend to test critical flows like Login and Dashboard rendering.
    -   Create `_test.ts` files for edge functions to unit-test the logic in isolation (mocking the AI providers).

### Medium Term
1.  **Embeddings/RAG**: Since `pgvector` is available, implementing "Chat with Candidate" using RAG (Retrieval Augmented Generation) on the resume text would be a powerful feature upgrade.
2.  **Performance Optimization**: Bundle the frontend assets more aggressively. The current `index.css` is quite large.
3.  **Monitoring**: Add Sentry or similar observability to the Edge Functions to track failures in real-time.

---

**Verdict**: CortexHR is a well-architected, modern application ready for production deployment. The foundation is solid, scalable, and resilient.
