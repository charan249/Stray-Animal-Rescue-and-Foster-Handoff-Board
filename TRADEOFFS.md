# Engineering Trade-offs & Design Decisions

This document outlines the architectural decisions, trade-offs, and intentional omissions made during the development of the Rescue Board.

## 🛠 Architectural Trade-offs

### 1. State Management: Snapshotting vs. Relational Joins
**Decision**: I implemented "caretaker snapshots" (`current_caretaker_name/phone`) directly in the `rescue_calls` table rather than performing complex joins on the `handoffs` table for every board render.
- **Trade-off**: This introduces slight data redundancy (denormalization).
- **Reasoning**: In a mission-critical board, read speed is paramount. Snapshotting allows for a single, fast query to render the entire board, ensuring volunteers aren't waiting for a page load during an emergency.

### 2. Real-time Strategy: WebSockets with Polling Fallback
**Decision**: The system uses `Socket.io` for instant updates, but retains a 30-second `setInterval` polling mechanism.
- **Trade-off**: Increased server overhead due to dual synchronization methods.
- **Reasoning**: WebSockets can occasionally drop on unstable mobile data (common in field rescue). The polling fallback ensures that even if a socket connection is lost, the board will eventually synchronize without requiring a manual refresh.

### 3. UI/UX: Playful vs. Clinical Aesthetic
**Decision**: Adopted a "Duolingo-style" playful design (chunky borders, vibrant colors, rounded fonts) over a traditional clinical medical interface.
- **Trade-off**: May appear "less serious" to traditional medical professionals.
- **Reasoning**: Animal rescue is high-stress. A playful, friendly UI reduces cognitive load and anxiety for volunteers, making the coordination process feel more approachable and less intimidating.

## 🛡️ Edge Case Handling

### 1. The "Race Condition" (Atomic Claiming)
To prevent two volunteers from claiming the same animal simultaneously, the system avoids a "read-then-write" pattern. Instead, it uses an **atomic SQL update**:
`UPDATE rescue_calls SET status = 'claimed' WHERE id = $1 AND status = 'reported'`
If the status changed between the time the user saw the button and clicked it, the query returns 0 rows, and the system triggers a "Too late—already claimed" error.

### 2. Stalled Rescues
A rescue is considered "stalled" if it remains in the `claimed` state for over 2 hours without moving to `picked_up`.
- **Handling**: The UI visually flags these cards (yellow border/STALLED tag), alerting coordinators that the driver may have encountered an issue.

### 3. GPS Failures
Geolocation is unpredictable in rural areas or inside buildings.
- **Handling**: The system allows for a manual text-based location input. If GPS fails or is denied, the system falls back to standard text search for Google Maps links.

## 🚫 Intentional Omissions

### 1. User Authentication & Accounts
The system does not currently require usernames or passwords.
- **Reasoning**: In emergency rescue, every second counts. Adding a login screen creates friction. The system instead relies on a "trust-but-verify" model where volunteers provide their name/phone at the point of action (Claim/Handoff).

### 2. Integrated Map View
Detailed interactive maps (e.g., Leaflet/Google Maps API) were removed.
- **Reasoning**: Integrated maps often lead to "map-bloat" on mobile devices, slowing down page loads. By providing a direct link to the Google Maps app, we leverage the native app's superior navigation and routing features.

### 3. Complex Role-Based Access Control (RBAC)
There is no separate "Admin" vs "Volunteer" login.
- **Reasoning**: The app is designed as a shared coordination space. Role-specific functionality is handled via the state of the rescue (e.g., only the current caretaker sees the "Mark as Picked Up" button).
