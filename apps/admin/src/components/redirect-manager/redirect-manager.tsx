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
  NativeSelect,
  toast,
} from "@nuvui/react";
import { DataTable } from "@nuvui/table";
import { createColumnHelper, useDataTable } from "@nuvui/table/full";
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
import { type RedirectFormState, removeRedirect, saveRedirectForm } from "@/actions/redirects";
import { useFormatDateTime } from "@/components/date-settings/date-settings";
import "./redirect-manager.scss";

// The Redirects screen (decisions #145): every redirect in a table the browser sorts and
// searches, a dialog to add or change one, and a confirmation to remove one.

export interface RedirectItem {
  fromPath: string;
  toPath: string;
  status: number;
  // ISO, for the browser.
  createdAt: string;
}

const STATUSES = [
  { value: "301", label: "Moved for good (301)" },
  { value: "302", label: "Moved for now (302)" },
  { value: "308", label: "Moved for good, keeping a form's sending (308)" },
  { value: "307", label: "Moved for now, keeping a form's sending (307)" },
];
const statusLabel = (status: number) =>
  status === 301 || status === 308 ? `For good (${status})` : `For now (${status})`;

type Editing = { row: RedirectItem | null } | null;

function RedirectForm({
  row,
  onSaved,
}: {
  row: RedirectItem | null;
  onSaved: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(saveRedirectForm, {
    result: "idle",
    values: {
      original: row?.fromPath ?? "",
      from: row?.fromPath ?? "",
      to: row?.toPath ?? "",
      status: String(row?.status ?? 301),
    },
  } satisfies RedirectFormState);
  const errors = state.errors ?? {};

  useEffect(() => {
    if (state.result === "saved" && state.message && state.savedAt) onSaved(state.message);
  }, [state.result, state.message, state.savedAt, onSaved]);

  return (
    <form action={action} className="redirect-manager__form" noValidate>
      <input type="hidden" name="original" value={state.values.original} />
      {state.result === "failed" ? (
        <Alert intent="danger" role="alert">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <Field required>
        <FieldLabel>From</FieldLabel>
        <FieldControl>
          <Input
            name="from"
            defaultValue={state.values.from}
            placeholder="/old-page"
            spellCheck={false}
          />
        </FieldControl>
        <FieldDescription>
          An address on this site. End it with /* for everything under it, such as /old-blog/*.
        </FieldDescription>
        <FieldError>{errors.from}</FieldError>
      </Field>
      <Field required>
        <FieldLabel>To</FieldLabel>
        <FieldControl>
          <Input
            name="to"
            defaultValue={state.values.to}
            placeholder="/new-page"
            spellCheck={false}
          />
        </FieldControl>
        <FieldDescription>
          An address on this site, or one starting with https://. After a /* address, end this with
          /* too to keep the rest: /old-blog/2024/x goes to /blog/2024/x.
        </FieldDescription>
        <FieldError>{errors.to}</FieldError>
      </Field>
      <Field>
        <FieldLabel>How</FieldLabel>
        <FieldControl>
          <NativeSelect name="status" defaultValue={state.values.status}>
            {STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </NativeSelect>
        </FieldControl>
        <FieldDescription>
          For good tells search engines to use the new address; for now keeps the old one.
        </FieldDescription>
        <FieldError>{errors.status}</FieldError>
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {row ? "Save" : "Add redirect"}
        </Button>
      </DialogFooter>
    </form>
  );
}

const helper = createColumnHelper<RedirectItem>();

export function RedirectManager({ rows }: { rows: RedirectItem[] }) {
  const router = useRouter();
  const formatDateTime = useFormatDateTime();
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<RedirectItem | null>(null);
  const [pending, startTransition] = useTransition();
  const addButton = useRef<HTMLButtonElement>(null);

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("fromPath", { header: "From", enableHiding: false }),
        helper.accessor("toPath", {
          header: "To",
          cell: ({ getValue }) => <span className="redirect-manager__to">{getValue()}</span>,
        }),
        helper.accessor("status", {
          header: "How",
          cell: ({ getValue }) => statusLabel(getValue()),
        }),
        helper.accessor("createdAt", {
          header: "Added",
          cell: ({ getValue }) => formatDateTime(new Date(getValue())),
        }),
        helper.display({
          id: "actions",
          header: "Actions",
          enableHiding: false,
          cell: ({ row }) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  intent="ghost"
                  size="sm"
                  className="redirect-manager__more"
                  aria-label={`Actions for ${row.original.fromPath}`}
                >
                  <MoreHorizontalIcon size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing({ row: row.original })}>
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem intent="danger" onSelect={() => setRemoving(row.original)}>
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ),
        }),
      ]),
    [formatDateTime],
  );

  const table = useDataTable({
    columns,
    data: rows,
    getRowId: (row) => row.fromPath,
    initialState: {
      pagination: { pageIndex: 0, pageSize: 20 },
      sorting: [{ id: "fromPath", desc: false }],
    },
  });

  // Stable, because the form's effect depends on it.
  const saved = useCallback(
    (message: string) => {
      setEditing(null);
      toast(message, { intent: "success", id: `redirect-${Date.now()}` });
      router.refresh();
    },
    [router],
  );

  function confirmRemove(row: RedirectItem) {
    startTransition(async () => {
      const result = await removeRedirect(row.fromPath);
      if (!result.ok) {
        toast(result.error, { intent: "danger" });
        return;
      }
      toast(`Removed the redirect from ${row.fromPath}`, { intent: "success" });
      router.refresh();
    });
  }

  return (
    <div className="redirect-manager">
      <div className="redirect-manager__bar">
        <Button ref={addButton} onClick={() => setEditing({ row: null })}>
          <PlusIcon size={16} />
          Add redirect
        </Button>
      </div>

      <DataTable
        table={table}
        aria-label="Redirects"
        rowHeader="fromPath"
        loading={pending}
        pageSizes={[20, 50, 100]}
        empty="No redirects yet. Moving a published page or post adds one."
      />

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogTitle>{editing?.row ? "Edit redirect" : "Add a redirect"}</DialogTitle>
          <DialogDescription>
            A page or post at the From address comes first: a redirect only answers where nothing
            else does.
          </DialogDescription>
          {editing ? (
            <RedirectForm
              // A fresh form, and so a fresh state, for each redirect opened.
              key={editing.row?.fromPath ?? "new"}
              row={editing.row}
              onSaved={saved}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <AlertDialogContent
          size="sm"
          onCloseAutoFocus={(event) => {
            // The row's menu is gone with its row; the Add button takes the focus.
            event.preventDefault();
            addButton.current?.focus();
          }}
        >
          <AlertDialogTitle>Remove the redirect from {removing?.fromPath}?</AlertDialogTitle>
          <AlertDialogDescription>
            Links to that address will find nothing there.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              intent="danger"
              onClick={() => {
                if (removing) confirmRemove(removing);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
