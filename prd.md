# Product Requirements Document: CUDA Learning Website

## 1. Overview

A web platform that teaches CUDA programming to C/C++ developers through structured concept pages, a browsable project database, and interactive sandboxes backed by real cloud GPUs. Users can sign up, track their progress, and run GPU code directly in the browser without any local setup.

---

## 2. Problem Statement

CUDA programming has a steep learning curve and a fragmented learning ecosystem. Most resources are either too theoretical (documentation, papers) or too environment-dependent (requiring a local NVIDIA GPU). Developers who want to learn GPU programming face:

- High setup friction (drivers, CUDA toolkit, compatible hardware)
- Lack of structured, project-based learning paths
- No interactive experimentation without owning a GPU
- Scattered resources with no unified progression system

This platform removes those barriers by providing structured learning content and zero-setup GPU execution in the browser.

---

## 3. Target Audience

**Primary:** C/C++ developers with no prior GPU programming experience who want to learn CUDA for performance-critical applications (HPC, ML infrastructure, game engines, graphics, systems programming).

**Secondary:** Intermediate CUDA developers looking to explore advanced optimization topics (memory hierarchies, warp-level primitives, multi-GPU).

**Not targeted:** Complete programming beginners or Python-only developers.

---

## 4. Goals & Success Metrics

### Goals
- Lower the barrier to learning CUDA by eliminating local GPU setup requirements
- Provide a structured, project-driven curriculum organized by GPU programming concepts
- Enable hands-on experimentation through browser-based sandboxes on real GPU hardware
- Track individual learner progress across concepts and projects

### Success Metrics
| Metric | Target |
|---|---|
| Sandbox execution success rate | >95% |
| Sandbox cold start latency | <10 seconds |
| User retention (D7) | >30% |
| Concept page completion rate | >50% for registered users |
| Weekly active users (6 months post-launch) | 1,000+ |

---

## 5. Core Features

### 5.1 Project Database

A browsable, searchable collection of CUDA projects organized by topic category.

**Topic Categories:**
- Memory (global, shared, constant, texture memory; coalescing; bandwidth optimization)
- Parallelism (thread hierarchy, warps, occupancy, synchronization)
- Optimization (profiling, loop unrolling, instruction-level parallelism, register usage)
- Algorithms (parallel reduction, prefix scan, sorting, matrix operations)
- Multi-GPU (peer access, NVLink, stream management)
- Interoperability (CUDA + OpenGL, CUDA + Vulkan, Thrust, cuBLAS)

**Each project entry includes:**
- Title, description, and difficulty level (Beginner / Intermediate / Advanced)
- Topic category tags
- Estimated completion time
- Prerequisites (linked concepts or projects)
- Starter code (C/CUDA)
- Expected output / correctness check
- Link to related concept pages
- User completion status (for logged-in users)

**UI:**
- Filter by category, difficulty, and completion status
- Search by keyword
- Sort by difficulty or popularity

---

### 5.2 GPU/CUDA Concept Pages

Structured educational content covering GPU architecture and CUDA programming concepts.

**Each concept page includes:**
- Conceptual explanation with diagrams (e.g., thread/block/grid hierarchy, memory hierarchy)
- Annotated code examples
- Common pitfalls and debugging tips
- Links to related projects in the database
- Links to related concepts (prerequisite / follow-up)
- Embedded sandbox for running example code

**Example concept pages:**
- How GPU thread hierarchy works
- Global memory coalescing
- Shared memory and bank conflicts
- Warp divergence
- CUDA streams and async execution
- Occupancy and register pressure

---

### 5.3 Interactive Sandbox (Cloud GPU)

A browser-based code editor that compiles and executes CUDA C++ on real GPU hardware.

**User experience:**
- Monaco-based code editor with CUDA syntax highlighting
- "Run" button submits code for execution
- stdout/stderr output displayed in a terminal panel
- Execution time and GPU utilization shown post-run
- Editable starter code pre-loaded from project or concept page context

**Execution backend:**
- Code submitted to a cloud GPU provider (RunPod or Modal) for compilation (`nvcc`) and execution
- Sandboxed container environment — no persistent state between runs
- Timeout enforced per execution (configurable, default 30 seconds)
- Resource limits: single GPU (T4 or A10), bounded CPU/RAM

**Safety:**
- No network access from sandbox containers
- No file system persistence
- Rate limiting per user/IP

---

### 5.4 User Auth & Progress Tracking

Full authentication system with persistent progress saved per user.

**Auth:**
- Sign up with email + password
- Login / logout
- Password reset via email
- OAuth (Google) — optional at launch

**Progress tracking:**
- Mark projects as "started," "completed"
- Mark concept pages as "read"
- Dashboard showing completion percentage per topic category
- Resume where you left off (last visited project/concept)
- Streak tracking (consecutive days with activity)

**Profile page:**
- Username, join date
- Completion stats by category
- List of completed projects

---

## 6. Technical Architecture

### Frontend
- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS
- **Code editor:** Monaco Editor (via `@monaco-editor/react`)
- **Auth client:** NextAuth.js
- **State management:** React Context or Zustand (lightweight)
- **Deployment:** Vercel

### Backend
- **API:** Next.js API routes (or separate Node/Express service if needed)
- **Database:** PostgreSQL (via Supabase or PlanetScale)
  - Users, sessions, progress records
  - Project metadata, concept page metadata
- **ORM:** Prisma
- **Auth:** NextAuth.js with Prisma adapter

### Sandbox Execution
- **Provider:** RunPod (serverless GPU) or Modal (Python-orchestrated GPU workers)
- **Flow:**
  1. Frontend sends code to Next.js API route
  2. API route forwards to GPU provider via REST/gRPC
  3. Provider compiles with `nvcc` and executes in isolated container
  4. stdout/stderr streamed or polled back to frontend
- **GPU type:** NVIDIA T4 or A10 (cost/performance balance)
- **Compilation:** CUDA Toolkit 12.x, `nvcc` with `-O2`

### Content
- Concept pages and project entries stored as MDX files in the repo (or in a headless CMS like Contentlayer / Sanity)
- Images/diagrams stored in `public/` or CDN

### Infrastructure
```
User Browser
    │
    ▼
Next.js (Vercel)
    ├── Static pages (concept pages, project listings)
    ├── API routes
    │       ├── Auth (NextAuth)
    │       ├── Progress (Prisma → PostgreSQL)
    │       └── Sandbox proxy → RunPod / Modal
    └── PostgreSQL (Supabase)
```

---

## 7. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Sandbox execution latency (p95) | <15 seconds end-to-end |
| API response time (non-sandbox) | <200ms p95 |
| Uptime | 99.5% monthly |
| Mobile responsiveness | Readable on mobile; sandbox editor desktop-first |
| Accessibility | WCAG 2.1 AA for static content pages |
| Security | OWASP Top 10 mitigations; sandbox network isolation |
| CUDA Toolkit version | 12.x (current stable) |

---

## 8. Out of Scope / Future Work

**Out of scope for v1:**
- Real-time collaborative editing
- User-submitted projects or community contributions
- Video content / screencasts
- Mobile-native apps
- Payment / premium tiers
- Forums or comments
- Certificates or badges
- Python CUDA (e.g., Numba, CuPy) — C/CUDA only at launch
- Multi-GPU sandbox environments

**Potential future work:**
- Community project submissions with moderation
- Leaderboards (fastest kernel for a given problem)
- Integration with NVIDIA Nsight for profiling output in sandbox
- Structured learning paths / courses with gated progression
- Premium tier with longer execution timeouts or dedicated GPU instances
- Localization (language translations)
