export type Role = 'committee_admin' | 'treasurer' | 'collector' | 'member' | 'viewer';
export type Perm = 'view_money' | 'collect' | 'expense' | 'approve' | 'coupons' | 'tasks';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  language: string;
  is_platform_admin: boolean;
}

export interface Organization {
  id: string;
  name: string;
  org_type: string;
  place: string | null;
  created_by: string;
}

export interface Committee {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
}

export type UnitLabel = 'house' | 'member' | 'family' | 'shop' | 'unit';

export interface Program {
  id: string;
  committee_id: string;
  name: string;
  year: number;
  status: 'active' | 'frozen';
  opening_balance: number;
  weekly_amount: number | null;
  total_weeks: number;
  unit_label: UnitLabel;
  committees?: Committee & { organizations?: Organization };
}

export interface Membership {
  id: string;
  program_id: string;
  profile_id: string | null;
  email: string;
  display_name: string | null;
  role: Role;
  permissions: Record<string, boolean>;
  programs?: Program;
}

export interface Finance {
  program_id: string;
  opening_balance: number;
  income_total: number;
  expense_total: number;
  payable_total: number;
  pending_claims: number;
  cash_balance: number;
  bank_balance: number;
}

export interface Area {
  id: string;
  program_id: string;
  name: string;
  assigned_member_ids: string[];
}

export interface House {
  id: string;
  program_id: string;
  area_id: string | null;
  name: string;
  owner_name: string | null;
  phone: string | null;
  email: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  in_subscription: boolean;
}

export interface IncomeEntry {
  id: string;
  program_id: string;
  entry_type: string;
  amount: number;
  mode: string;
  entry_date: string;
  receipt_no: number | null;
  area_id: string | null;
  house_id: string | null;
  payer_name: string | null;
  coupon_book_id: string | null;
  subscription_week: number | null;
  collected_by: string;
  handed_over: boolean;
  notes: string | null;
  created_at: string;
  deleted_at: string | null;
  delete_reason: string | null;
}

export interface ExpenseHead {
  id: string;
  program_id: string;
  name: string;
  name_ml: string | null;
}

export interface Expense {
  id: string;
  program_id: string;
  head_id: string;
  kind: 'wallet' | 'claim' | 'advance' | 'advance_settlement';
  amount: number;
  expense_date: string;
  event_day: number | null;
  vendor_name: string | null;
  description: string | null;
  bill_url: string | null;
  mode: string;
  claimant: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  reject_reason: string | null;
  advance_id: string | null;
  created_by: string;
  created_at: string;
  deleted_at: string | null;
  delete_reason: string | null;
}

export interface CouponScheme {
  id: string;
  program_id: string;
  name: string;
  price: number;
  total_coupons: number;
  coupons_per_book: number;
}

export interface CouponBook {
  id: string;
  scheme_id: string;
  program_id: string;
  book_no: string;
  coupons_count: number;
  holder_name: string;
  holder_phone: string | null;
  sold_count: number;
  returned_count: number;
  status: string;
  scheme_name?: string;
  price?: number;
  sold_value?: number;
  remitted?: number;
  outstanding?: number;
}

export interface CommitteeTask {
  id: string;
  program_id: string;
  title: string;
  description: string | null;
  assignee_member_id: string | null;
  status: 'pending' | 'in_progress' | 'done';
  due_date: string | null;
}

export interface BudgetItem {
  id: string;
  program_id: string;
  side: 'income' | 'expense';
  income_type: string | null;
  head_id: string | null;
  planned: number;
}
