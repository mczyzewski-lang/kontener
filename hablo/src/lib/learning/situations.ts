/** Life situations offered in onboarding, mapped to content topics and scenarios. */
export const SITUATIONS = [
  { id: "restaurant", label: "Restauracje i bary", topics: ["food"], scenarios: ["restaurant-waiter", "cafe-order"] },
  { id: "shopping", label: "Zakupy", topics: ["shopping"], scenarios: ["shopping-store", "price-negotiation"] },
  { id: "neighbors", label: "Sąsiedzi i small talk", topics: ["people", "home"], scenarios: ["neighbor-chat", "new-friend"] },
  { id: "travel", label: "Podróże i samochód", topics: ["travel"], scenarios: ["car-rental", "holiday-story"] },
  { id: "work", label: "Praca i biznes", topics: ["work"], scenarios: ["my-work"] },
  { id: "home", label: "Dom, remont, fachowcy", topics: ["home", "problems"], scenarios: ["contractor-house", "delivery-problem"] },
  { id: "health", label: "Zdrowie i urzędy", topics: ["health"], scenarios: ["doctor-appointment"] },
  { id: "family", label: "Rodzina i znajomi", topics: ["family", "people", "feelings"], scenarios: ["family-talk", "new-friend"] },
] as const;

export type SituationId = (typeof SITUATIONS)[number]["id"];

export function topicsFor(situations: string[]): Set<string> {
  return new Set(SITUATIONS.filter((s) => situations.includes(s.id)).flatMap((s) => [...s.topics]));
}

export function scenariosFor(situations: string[]): string[] {
  return [...new Set(SITUATIONS.filter((s) => situations.includes(s.id)).flatMap((s) => [...s.scenarios]))];
}
