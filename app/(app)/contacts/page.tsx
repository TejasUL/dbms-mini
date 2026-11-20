"use client";

import { useState, type FormEvent, type InputHTMLAttributes } from "react";
import type { EmergencyContactDto } from "@/lib/types";
import { errorMessage } from "@/lib/client/api";
import {
  useContacts,
  useCreateContact,
  useDeleteContact,
  useUpdateContact,
  type ContactInput,
} from "@/lib/client/contacts";
import {
  MailIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from "@/components/icons";

const MAX_CONTACTS = 5;
const PHONE_RE = /^\+[1-9]\d{7,14}$/;

function LabeledInput({
  id,
  label,
  hint,
  ...rest
}: {
  id: string;
  label: string;
  hint?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input id={id} className="field-input" {...rest} />
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-faint">{hint}</p>}
    </div>
  );
}

function ContactForm({
  initial,
  onSubmit,
  submitLabel,
  mutating,
}: {
  initial?: EmergencyContactDto;
  onSubmit: (input: ContactInput) => void;
  submitLabel: string;
  mutating: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [relationship, setRelationship] = useState(initial?.relationship ?? "");
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedPhone = phone.trim();
    if (!PHONE_RE.test(trimmedPhone)) {
      setPhoneError("Phone must include country code, e.g. +919876543210");
      return;
    }
    setPhoneError(null);
    onSubmit({
      name: name.trim(),
      phone: trimmedPhone,
      email: email.trim(),
      relationship: relationship.trim() || undefined,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <LabeledInput
        id="contact-name"
        label="Name"
        required
        maxLength={120}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <LabeledInput
        id="contact-phone"
        label="Phone"
        required
        placeholder="+14155550123"
        value={phone}
        onChange={(event) => {
          setPhone(event.target.value);
          setPhoneError(null);
        }}
      />
      {phoneError && (
        <p role="alert" className="text-xs text-signal-soft">
          {phoneError}
        </p>
      )}
      <LabeledInput
        id="contact-email"
        label="Email"
        type="email"
        required
        placeholder="name@example.com"
        value={email}
        hint="Required — the live tracking link is sent here."
        onChange={(event) => setEmail(event.target.value)}
      />
      <LabeledInput
        id="contact-relationship"
        label="Relationship (optional)"
        maxLength={80}
        value={relationship}
        onChange={(event) => setRelationship(event.target.value)}
      />
      <button
        type="submit"
        disabled={mutating}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-signal py-2 text-sm font-semibold text-white transition-colors hover:bg-signal-bright disabled:opacity-50"
      >
        <PlusIcon className="h-4 w-4" />
        {submitLabel}
      </button>
    </form>
  );
}

export default function ContactsPage() {
  const { data: contacts, isPending, isError } = useContacts();
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);

  const list = contacts ?? [];
  const editing = list.find((contact) => contact.id === editingId);
  const count = list.length;

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setMutating(true);
    try {
      await fn();
      setEditingId(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setMutating(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl animate-rise text-chalk">
      <header>
        <p className="eyebrow">Your people</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
          Emergency contacts
        </h1>
        <p className="mt-2 text-sm text-mist">
          At least one contact is required before SOS is enabled.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex gap-1.5" aria-hidden>
            {Array.from({ length: MAX_CONTACTS }, (_, index) => (
              <span
                key={index}
                className={`h-1.5 w-8 rounded-full ${index < count ? "bg-safe" : "bg-line"}`}
              />
            ))}
          </div>
          <span className="font-mono text-xs text-mist">
            {count}/{MAX_CONTACTS} SLOTS
          </span>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-signal/40 bg-signal/10 p-3 text-sm text-signal-soft"
        >
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <section>
          {isPending ? (
            <p className="text-sm text-mist">Loading contacts…</p>
          ) : isError ? (
            <p className="text-sm text-signal-soft">Could not load contacts.</p>
          ) : list.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-panel/60 p-10 text-center">
              <UsersIcon className="mx-auto h-8 w-8 text-faint" />
              <p className="mt-3 text-sm font-medium text-chalk">No contacts yet</p>
              <p className="mt-1 text-sm text-mist">
                Add your first emergency contact to enable SOS.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {list.map((contact) => (
                <li
                  key={contact.id}
                  className={`flex items-center justify-between gap-4 rounded-2xl border p-4 transition-colors ${
                    editingId === contact.id
                      ? "border-signal/50 bg-signal/5"
                      : "border-line bg-panel hover:border-line-bright"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-raised font-display text-base font-semibold text-mist">
                      {contact.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-chalk">{contact.name}</p>
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-mist">
                        {contact.phone && (
                          <span className="inline-flex items-center gap-1">
                            <PhoneIcon className="h-3 w-3 text-faint" />
                            {contact.phone}
                          </span>
                        )}
                        {contact.email && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <MailIcon className="h-3 w-3 shrink-0 text-faint" />
                            {contact.email}
                          </span>
                        )}
                        {contact.relationship && (
                          <span className="text-faint">{contact.relationship}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() =>
                        setEditingId(editingId === contact.id ? null : contact.id)
                      }
                      className="flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-mist transition-colors hover:border-line-bright hover:text-chalk"
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                      {editingId === contact.id ? "Cancel" : "Edit"}
                    </button>
                    <button
                      disabled={mutating}
                      onClick={() =>
                        run(async () => {
                          await deleteContact.mutateAsync(contact.id);
                        })
                      }
                      className="flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-signal-soft transition-colors hover:border-signal/60 hover:bg-signal/10 disabled:opacity-60"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="h-fit rounded-2xl border border-line bg-panel p-5 lg:sticky lg:top-6">
          {editing ? (
            <>
              <h2 className="mb-4 font-display text-lg font-semibold text-chalk">
                Edit {editing.name}
              </h2>
              <ContactForm
                key={editing.id}
                initial={editing}
                mutating={mutating}
                submitLabel={mutating ? "Saving…" : "Save changes"}
                onSubmit={(input) =>
                  run(async () => {
                    await updateContact.mutateAsync({ id: editing.id, ...input });
                  })
                }
              />
            </>
          ) : (
            <>
              <h2 className="mb-4 font-display text-lg font-semibold text-chalk">
                Add a contact
              </h2>
              {count >= MAX_CONTACTS ? (
                <p className="text-sm leading-relaxed text-caution">
                  You&apos;ve reached the 5-contact limit. Remove one to add another.
                </p>
              ) : (
                <ContactForm
                  mutating={mutating}
                  submitLabel={mutating ? "Adding…" : "Add contact"}
                  onSubmit={(input) =>
                    run(async () => {
                      await createContact.mutateAsync(input);
                    })
                  }
                />
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
