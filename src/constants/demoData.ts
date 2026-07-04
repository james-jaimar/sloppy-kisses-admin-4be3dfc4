export const demoCustomers = [
  { id: "cus_001", number: "SK-1042", name: "Sarah Johnson", email: "sarah.johnson@example.com", phone: "+27 82 555 0142", pets: 2, outstanding: 480, since: "2023-04-12" },
  { id: "cus_002", number: "SK-1043", name: "Michael Chen",  email: "m.chen@example.com",        phone: "+27 83 555 0221", pets: 1, outstanding: 0,   since: "2024-01-08" },
  { id: "cus_003", number: "SK-1044", name: "Priya Naidoo",  email: "priya.n@example.com",       phone: "+27 84 555 0333", pets: 3, outstanding: 1250, since: "2022-09-19" },
  { id: "cus_004", number: "SK-1045", name: "Thabo Mokoena", email: "thabo.m@example.com",       phone: "+27 82 555 0407", pets: 1, outstanding: 0,   since: "2024-06-02" },
];

export const demoPets = [
  { id: "pet_001", name: "Max",    breed: "Golden Retriever", species: "dog", ageYears: 4, ownerId: "cus_001", vaccStatus: "up_to_date" as const },
  { id: "pet_002", name: "Bella",  breed: "Cavoodle",         species: "dog", ageYears: 2, ownerId: "cus_001", vaccStatus: "expiring"    as const },
  { id: "pet_003", name: "Luna",   breed: "British Shorthair",species: "cat", ageYears: 6, ownerId: "cus_003", vaccStatus: "up_to_date" as const },
  { id: "pet_004", name: "Rocky",  breed: "Boxer",            species: "dog", ageYears: 5, ownerId: "cus_002", vaccStatus: "missing"    as const },
];

export const demoTodayGrooming = [
  { id: "b1", time: "08:30", pet: "Max",    owner: "Sarah Johnson", service: "Full Groom",  groomer: "Nomvula", status: "checked_in" },
  { id: "b2", time: "09:15", pet: "Rocky",  owner: "Michael Chen",  service: "Bath & Tidy", groomer: "Kagiso",  status: "in_progress" },
  { id: "b3", time: "10:00", pet: "Bella",  owner: "Sarah Johnson", service: "Full Groom",  groomer: "Nomvula", status: "confirmed" },
  { id: "b4", time: "11:30", pet: "Luna",   owner: "Priya Naidoo",  service: "Cat Groom",   groomer: "Sipho",   status: "confirmed" },
  { id: "b5", time: "13:00", pet: "Charlie",owner: "Thabo Mokoena", service: "Nail Trim",   groomer: "Kagiso",  status: "confirmed" },
];

export const demoBookingRequests = [
  { id: "r1", createdAt: "2h ago",  customer: "Amelia Roberts", pet: "Milo (French Bulldog)", service: "Mobile Grooming", preferred: "Thu 10 Jul, 09:00-11:00", status: "pending_review" as const, hasDocs: false },
  { id: "r2", createdAt: "5h ago",  customer: "James O'Neill",  pet: "Ziggy (Border Collie)",  service: "Daycare Assessment", preferred: "Mon 14 Jul", status: "pending_review" as const, hasDocs: true },
  { id: "r3", createdAt: "yesterday", customer: "Rethabile Dube", pet: "Kiara (Poodle)",       service: "Hotel Stay 4 nights", preferred: "20-24 Jul", status: "needs_info"   as const, hasDocs: true },
  { id: "r4", createdAt: "2d ago",  customer: "Sarah Johnson",  pet: "Bella (Cavoodle)",       service: "Pick Up / Drop Off", preferred: "Fri 11 Jul, 07:30", status: "approved" as const, hasDocs: true },
  { id: "r5", createdAt: "3d ago",  customer: "Priya Naidoo",   pet: "Luna (British Shorthair)", service: "Cattery 6 nights", preferred: "1-7 Aug", status: "pending_review" as const, hasDocs: false },
  { id: "r6", createdAt: "4d ago",  customer: "Michael Chen",   pet: "Rocky (Boxer)",          service: "In-House Grooming",  preferred: "Sat 12 Jul, 11:00", status: "declined" as const, hasDocs: true },
];

export const demoDaycareList = [
  { id: "d1", pet: "Max",     owner: "Sarah Johnson", plan: "3-day plan",   daysBookedThisMonth: 12, status: "checked_in" as const, arrival: "07:42", notes: "Feed at noon" },
  { id: "d2", pet: "Rocky",   owner: "Michael Chen",  plan: "Pay as you go",daysBookedThisMonth: 4,  status: "checked_in" as const, arrival: "07:58", notes: "" },
  { id: "d3", pet: "Ziggy",   owner: "James O'Neill", plan: "Assessment",   daysBookedThisMonth: 1,  status: "not_arrived" as const, arrival: "-",     notes: "First day - take slow" },
  { id: "d4", pet: "Milo",    owner: "Amelia Roberts",plan: "5-day plan",   daysBookedThisMonth: 18, status: "checked_in" as const, arrival: "08:12", notes: "" },
  { id: "d5", pet: "Kiara",   owner: "Rethabile Dube",plan: "2-day plan",   daysBookedThisMonth: 6,  status: "checked_out" as const, arrival: "07:30", notes: "" },
  { id: "d6", pet: "Bella",   owner: "Sarah Johnson", plan: "3-day plan",   daysBookedThisMonth: 12, status: "not_arrived" as const, arrival: "-",     notes: "" },
  { id: "d7", pet: "Charlie", owner: "Thabo Mokoena", plan: "Walk-in",      daysBookedThisMonth: 1,  status: "walk_in"  as const,   arrival: "08:45", notes: "Walk-in today" },
];