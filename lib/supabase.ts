import {
  getProgressionSupabaseClient,
  getProgressionSupabaseConfigurationError,
} from "@/lib/progression-supabase";

export const supabase = getProgressionSupabaseClient();

export function getSupabaseClient() {
  return supabase;
}

export function getSupabaseConfigurationError() {
  return getProgressionSupabaseConfigurationError();
}
