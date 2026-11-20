"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EmergencyContactDto } from "@/lib/types";
import { apiClient } from "./api";

export const contactsQueryKey = ["contacts"] as const;

export interface ContactInput {
  name: string;
  phone: string;
  email: string;
  relationship?: string;
}

export function useContacts() {
  return useQuery<EmergencyContactDto[]>({
    queryKey: contactsQueryKey,
    queryFn: async () => (await apiClient.get("/contacts")).data,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ContactInput) => {
      const response = await apiClient.post("/contacts", input);
      return response.data as EmergencyContactDto;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: contactsQueryKey }),
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: ContactInput & { id: string }) => {
      const response = await apiClient.patch(`/contacts/${id}`, input);
      return response.data as EmergencyContactDto;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: contactsQueryKey }),
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/contacts/${id}`);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: contactsQueryKey }),
  });
}
