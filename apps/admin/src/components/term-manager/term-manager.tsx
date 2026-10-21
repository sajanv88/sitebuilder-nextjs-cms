// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { MoreHorizontalIcon, PlusIcon } from "@nuvui/icons";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  toast,
} from "@nuvui/react";
import { DataTable } from "@nuvui/table";
import { createColumnHelper, useDataTable } from "@nuvui/table/full";
import type { TermRow } from "@sitebuilder/db";
import type { TaxonomyKind } from "@sitebuilder/schema";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { removeTerm, saveTerm, type TermFormState } from "@/actions/terms";
import "./term-manager.scss";

// The Categories or Tags screen: every term in a table (a site has tens, so the browser sorts
// and searches them), a dialog to add or rename one, and a confirmation to delete one.

const NOUNS = {
  category: { one: "category", many: "categories", title: "Category" },
  tag: { one: "tag", many: "tags", title: "Tag" },
} as const satisfies Record<TaxonomyKind, { one: string; many: string; title: string }>;

type Editing = { term: TermRow | null } | null;

function TermForm({
  taxonomy,
  term,
  onSaved,
}: {
  taxonomy: TaxonomyKind;
  term: TermRow | null;
  onSaved: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(saveTerm, {
    result: "idle",
    values: { name: term?.name ?? "", slug: term?.slug ?? "" },
  } satisfies TermFormState);
  const errors = state.errors ?? {};

  useEffect(() => {
    if (state.result === "saved" && state.message && state.savedAt) onSaved(state.message);
  }, [state.result, state.message, state.savedAt, onSaved]);

  return (
    <form action={action} className="term-manager__form" noValidate>
      <input type="hidden" name="id" value={term?.id ?? ""} />
      <input type="hidden" name="taxonomy" value={taxonomy} />
      {state.result === "failed" ? (
        <Alert intent="danger" role="alert">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <Field required>
        <FieldLabel>Name</FieldLabel>
        <FieldControl>
          <Input name="name" defaultValue={state.values.name} maxLength={80} />
        </FieldControl>
        <FieldError>{errors.name}</FieldError>
      </Field>
      <Field>
        <FieldLabel>Slug</FieldLabel>
        <FieldControl>
          <Input name="slug" defaultValue={state.values.slug} spellCheck={false} />
        </FieldControl>
        <FieldDescription>
          Used in the archive's address. Empty makes one from the name.
        </FieldDescription>
        <FieldError>{errors.slug}</FieldError>
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {term ? "Save" : `Add ${NOUNS[taxonomy].one}`}
        </Button>
      </DialogFooter>
    </form>
  );
}

const helper = createColumnHelper<TermRow>();

export function TermManager({
  taxonomy,
  terms,
  allowed,
}: {
  taxonomy: TaxonomyKind;
  terms: TermRow[];
  allowed: { create: boolean; update: boolean; delete: boolean };
}) {
  const router = useRouter();
  const noun = NOUNS[taxonomy];
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<TermRow | null>(null);
  const [pending, startTransition] = useTransition();
  const addButton = useRef<HTMLButtonElement>(null);

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("name", { header: "Name", enableHiding: false }),
        helper.accessor("slug", { header: "Slug" }),
        helper.accessor("postCount", { header: "Posts", meta: { align: "end" } }),
        helper.display({
          id: "actions",
          header: "Actions",
          enableHiding: false,
          cell: ({ row }) =>
            allowed.update || allowed.delete ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    intent="ghost"
                    size="sm"
                    className="term-manager__more"
                    aria-label={`Actions for ${row.original.name}`}
                  >
                    <MoreHorizontalIcon size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {allowed.update ? (
                    <DropdownMenuItem onSelect={() => setEditing({ term: row.original })}>
                      Rename
                    </DropdownMenuItem>
                  ) : null}
                  {allowed.update && allowed.delete ? <DropdownMenuSeparator /> : null}
                  {allowed.delete ? (
                    <DropdownMenuItem intent="danger" onSelect={() => setDeleting(row.original)}>
                      Delete
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null,
        }),
      ]),
    [allowed.update, allowed.delete],
  );

  const table = useDataTable({
    columns,
    data: terms,
    getRowId: (term) => term.id,
    initialState: {
      pagination: { pageIndex: 0, pageSize: 20 },
      sorting: [{ id: "name", desc: false }],
    },
  });

  // Stable, because the form's effect depends on it.
  const saved = useCallback(
    (message: string) => {
      setEditing(null);
      toast(message, { intent: "success", id: `term-${message}` });
      router.refresh();
    },
    [router],
  );

  function confirmDelete(term: TermRow) {
    startTransition(async () => {
      const result = await removeTerm(term.id);
      if (!result.ok) {
        toast(result.error, { intent: "danger" });
        return;
      }
      toast(`Deleted ${term.name}`, { intent: "success" });
      router.refresh();
    });
  }

  return (
    <div className="term-manager">
      {allowed.create ? (
        <div className="term-manager__bar">
          <Button ref={addButton} onClick={() => setEditing({ term: null })}>
            <PlusIcon size={16} />
            Add {noun.one}
          </Button>
        </div>
      ) : null}

      <DataTable
        table={table}
        aria-label={noun.title === "Tag" ? "Tags" : "Categories"}
        rowHeader="name"
        loading={pending}
        pageSizes={[20, 50, 100]}
        empty={`No ${noun.many} yet.`}
      />

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent size="sm">
          <DialogTitle>
            {editing?.term ? `Rename ${editing.term.name}` : `Add a ${noun.one}`}
          </DialogTitle>
          <DialogDescription>
            {editing?.term
              ? "Posts keep it under its new name."
              : `A ${noun.one} groups posts, and gets an archive page of its own.`}
          </DialogDescription>
          {editing ? (
            <TermForm
              // A fresh form, and so a fresh state, for each term opened.
              key={editing.term?.id ?? "new"}
              taxonomy={taxonomy}
              term={editing.term}
              onSaved={saved}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent
          size="sm"
          onCloseAutoFocus={(event) => {
            // The row's menu is gone with its item; the Add button takes the focus.
            event.preventDefault();
            addButton.current?.focus();
          }}
        >
          <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {deleting && deleting.postCount > 0
              ? `It's taken off ${deleting.postCount === 1 ? "1 post" : `${deleting.postCount} posts`}; the posts themselves stay.`
              : "No posts use it."}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              intent="danger"
              onClick={() => {
                if (deleting) confirmDelete(deleting);
              }}
            >
              Delete {noun.one}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
