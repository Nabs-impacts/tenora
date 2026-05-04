import api from "./client";

export interface Coupon {
  id: number;
  code: string;
  discount_percent: number | null;
  discount_amount:  number | null;
  user_id:    number | null;
  max_uses:   number | null;
  times_used: number;
  expires_at: string | null;
  is_active:  boolean;
  created_at: string;
  product_ids:  number[];
  category_ids: number[];
}

export interface CouponPayload {
  code?: string;
  code_length?: number;
  discount_percent?: number | null;
  discount_amount?:  number | null;
  user_id?: number | null;
  max_uses?: number | null;
  expires_at?: string | null;
  is_active?: boolean;
  product_ids?:  number[];
  category_ids?: number[];
}

export const getCoupons = (params?: { q?: string; active?: boolean }) =>
  api.get<Coupon[]>("/panel/coupons", { params });

export const createCoupon = (data: CouponPayload) =>
  api.post<Coupon>("/panel/coupons", data);

export const updateCoupon = (id: number, data: CouponPayload) =>
  api.put<Coupon>(`/panel/coupons/${id}`, data);

export const deleteCoupon = (id: number) =>
  api.delete(`/panel/coupons/${id}`);
