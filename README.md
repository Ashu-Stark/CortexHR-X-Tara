# CortexHR - AI-Powered Recruitment Platform

CortexHR is a next-generation Applicant Tracking System (ATS) that automates the entire recruitment lifecycle using advanced AI. From resume parsing to interview scheduling, CortexHR streamlines hiring for modern teams.

email - ashutosh16200604@gmail.com
password -159951

---

## 🚀 Key Features

*   **AI Resume Parsing**: Automatically extracts candidate details, skills, and experience from PDFs using Groq (Llama 3) and Gemini.
*   **Smart Scoring**: Scores candidates (0-100) against job descriptions using semantic matching.
*   **Automated Scheduling**: Integrates with Google Calendar to generate Meet links and send professional invites.
*   **"Poison Pill" Protection**: Robust email handling that prevents invalid addresses from blocking campaign queues.
*   **Gmail Auto-Import**: Periodically scans Gmail for new resume submissions and ingests them automatically.
*   **Role-Based Access**: Secure RBAC for Admins, Recruiters, and HR Managers.
*   **Offer Management**: Auto-generates contract drafts when a candidate is moved to the "Offer" stage.

---

## 🛠 Tech Stack

*   **Frontend**: React (Vite), TypeScript, Tailwind CSS, Shadcn UI.
*   **Backend**: Supabase (PostgreSQL 15+, Auth, Storage, Edge Functions).
*   **AI Providers**:
    *   **Google Gemini 1.5 Flash** (Primary / Vision)
    *   **Groq Llama 3 70B** (High-speed Reasoning)
    *   **Mistral** (Fallback)
*   **Infrastructure**: Deno-based Edge Functions.

---

## ⚡ Getting Started

### Prerequisites
*   Node.js 18+
*   Supabase Project

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/Ashu-Stark/CortexHR-X-Tara.git
    cd CortexHR-X-Tara
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Environment Setup**
    Create a `.env` file with your Supabase credentials:
    ```env
    VITE_SUPABASE_URL=your_project_url
    VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
    ```

4.  **Run Locally**
    ```bash
    npm run dev
    ```

---

## 📂 Project Structure

*   **/src**: React Frontend application.
*   **/supabase/functions**: Deno Edge Functions (AI logic lives here).
*   **/backend**: Database schemas and migration SQL.

---

## 🤖 AI Architecture

CortexHR uses a **Resilient Multi-Provider Strategy**:
1.  **Primary**: Google Gemini for broad context and vision.
2.  **Speed**: Groq (Llama 3) for instant text analysis.
3.  **Resilience**: Intelligent key rotation and automatic fallback to Mistral/OpenAI if primary providers fail.

---

## 📄 License

Proprietary Software. All rights reserved.
