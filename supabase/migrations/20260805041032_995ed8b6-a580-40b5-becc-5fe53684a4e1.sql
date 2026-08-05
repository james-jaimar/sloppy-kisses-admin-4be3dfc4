ALTER TABLE public.hotel_workflow_settings
  ADD COLUMN IF NOT EXISTS guidelines_md text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS guidelines_version integer NOT NULL DEFAULT 1;

UPDATE public.hotel_workflow_settings
SET guidelines_md = $md$## 1. What to Pack
- Please pack your pet's food in **labelled ziplock bags** (name + breed)
- No beds, bowls, pillows or extras are needed. If you do send anything, please label it clearly
- We only feed the food you provide
- All meals and medication must come with **clear written instructions**

## 2. Check-In & Check-Out
- **Mon–Sat:** 09:00–11:00
- **Late Check-Out (Stay & Play):** 16:00–16:30 (extra fee)
- **Sun & Public Holidays:** Check-out only 16:00–16:30
- **Closed:** 25–26 Dec and 1 Jan (staff on duty, but no drop-offs/collections)
- Gates open only during these hours for staff safety

## 3. Health & Safety
- Dogs must be fully social
- Pets must be sterilised, vaccinated, and dewormed
- Kennel Cough vaccine must be done **10 days before arrival**

## 4. Trial Days
A trial day may be requested to ensure your dog is comfortable and social with our group.

## 5. Updates & Communication
- Daily photos are posted on Facebook. We don't send photos privately
- WhatsApp is welcome, but replies may be slower during busy periods
- Emergencies will be communicated directly — no news is good news
- The office is closed on weekends and public holidays

## 6. Identification
- Pets must wear a collar with a name tag and contact number

## 7. Pet Insurance
- Recommended but not required
- Owners are responsible for any costs if their pet injures another pet/person or is injured

## 8. Accommodation Options
- **Puppy Palace** — For our tiniest VIPs. A cosy, social haven designed for small dogs, featuring a warm shared lounge, soft-screen TV time, and a private garden perfect for gentle play.
- **Beachside Cabanas** — Relaxed luxury for playful pups. Inspired by sun-kissed beach escapes, each bungalow offers a private room, two plush beds, and a tranquil private garden. Ideal for up to three dogs who enjoy a breezy, holiday-style retreat.
- **City Deluxe Suites** — Premium designer suites inspired by iconic cities. Choose from our Paris, New York, London, or South Africa suites — each styled with its own signature décor. These spacious rooms feature a queen-size bed, TV, air-conditioning, and a private garden. Shared with up to four compatible dogs for a sophisticated, social stay.

## 9. Grooming
- We recommend grooming before going home at a 50% discount if booked at check-in or when making your reservation

## 10. Hotel Viewings
Viewings by appointment only: **Mon–Fri, 10:00–13:00**.$md$
WHERE coalesce(guidelines_md, '') = '';