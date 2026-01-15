export type Barber = { id: string; name: string; working: boolean };

export type ShopSettings = {
  id: true;
  barber_count: number;
  visible_count: number;
  barbers: Barber[];
  updated_at: string;
};

export type QueueStatus = "waiting" | "called" | "served" | "no_show";

export type QueueEntry = {
  id: string;
  first_name: string;
  last_initial: string;
  preferred_barber_id: string | null;
  status: QueueStatus;
  created_at: string;
  called_at: string | null;
  called_by_barber_id: string | null;
  served_at: string | null;
  skipped_at: string | null;
};

export const displayName = (e: Pick<QueueEntry, "first_name" | "last_initial">) =>
  `${e.first_name.trim()} ${e.last_initial.trim().toUpperCase()}.`;
