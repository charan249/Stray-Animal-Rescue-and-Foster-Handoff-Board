# Rescue Board - Animal Rescue Coordination System

A mission-critical, real-time coordination dashboard designed for animal rescue volunteers. The primary goal is to minimize friction for field workers and ensure a reliable chain of custody for animals in transition from report to foster care.

## Key Features

### GPS-Based Proximity Sorting
To get animals to safety faster, the board automatically sorts rescue calls based on the volunteer's current location.
- **Implementation**: Uses the browser's `navigator.geolocation` API and the **Haversine Formula** to calculate the distance between the volunteer and the rescue site in real-time.
- **Benefit**: Volunteers can instantly identify the closest emergencies, reducing response time.

### Atomic Claiming (Race-Condition Prevention)
In high-pressure situations, multiple volunteers might try to claim the same rescue.
- **Implementation**: Uses a strict atomic SQL update: `UPDATE rescue_calls SET status = 'claimed' WHERE id = $1 AND status = 'reported'`.
- **Benefit**: This ensures that only one person can successfully claim a rescue, preventing duplicate pickups and coordination chaos.

### Real-time Synchronization
No one has to manually refresh the page to see new rescues or claims.
- **Implementation**: Powered by **Socket.io**, the server emits a `refresh` event to all connected clients whenever a state change occurs (Report -> Claim -> Pickup -> Clinic -> Foster).
- **Benefit**: The entire team sees the same board state instantly.

### Chain of Custody Tracking
Ensures every animal's medical and caretaker history is preserved.
- **Implementation**: A linear state-machine routing system (`reported` -> `claimed` -> `picked_up` -> `at_clinic` -> `at_foster` -> `resolved`).
- **Medical View**: A dedicated "Medical File" view aggregates all handoff notes and daily health check-ins into a chronological timeline.

### Duolingo-Inspired UI/UX
Designed for high-stress environments where speed and clarity are paramount.
- **The "Sticker" Aesthetic**: A flat, high-contrast design with chunky borders and tactile 3D buttons.
- **Mobile-First**: Fully responsive layout with "Slide-up Sheets" for modals, optimized for one-handed use on mobile devices in the field.

## Tech Stack

- **Backend**: Node.js, Express
- **Database**: PostgreSQL (via `pg` pool)
- **Real-time**: Socket.io
- **Frontend**: Vanilla JavaScript, CSS3 (Custom Properties)
- **Infrastructure**: Environment variables via `dotenv`

## Setup & Installation

1. **Clone the repository**:
   ```bash
   git clone <repo-url>
   cd rescue-board
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Setup**:
   Create a `.env` file in the root directory:
   ```env
   DATABASE_URL=your_postgresql_connection_string
   PORT=3000
   ```

4. **Database Initialization**:
   Run the `schema.sql` in your PostgreSQL instance to create the necessary tables.

5. **Run the server**:
   ```bash
   npm start
   ```

6. **Access the app**:
   Open `http://localhost:3000` in your browser.

## Rescue Lifecycle

1. **Reported**: A rescue is logged with GPS coordinates and urgency.
2. **Claimed**: A volunteer claims the rescue (Atomic check).
3. **Picked Up**: Driver confirms pickup (Automatic driver attribution).
4. **At Clinic**: Animal is handed over to medical staff (Caretaker sync).
5. **At Foster**: Animal is placed with a foster parent (Mandatory medical notes).
6. **Resolved**: Rescue is completed and animal is safe.
