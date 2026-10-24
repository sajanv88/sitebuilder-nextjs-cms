// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

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
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Fieldset,
  FieldsetLegend,
  Input,
  Progress,
  RadioGroup,
  RadioGroupItem,
  Spinner,
  Stepper,
  StepperContent,
  StepperIndicator,
  StepperItem,
  StepperTitle,
  Textarea,
} from "@nuvui/react";
import type { AiInterview, AiQuestion, SitePlan } from "@sitebuilder/schema";
import Link from "next/link";
import { useCallback, useId, useRef, useState } from "react";
import "./create-with-ai.scss";

// Create with AI (design §15, phase 8 plan 8.6): the admin describes the site, answers the
// model's questions, edits its plan, and the pages are written as drafts, three at a time and
// parents first. Nothing is public until a person publishes it. The server checks everything
// this screen sends again (B5.2); this screen only holds the work in progress.

type Stage = "describe" | "questions" | "plan" | "writing" | "done";
const STEPS: { stage: Stage; title: string }[] = [
  { stage: "describe", title: "Describe" },
  { stage: "questions", title: "Questions" },
  { stage: "plan", title: "Plan" },
  { stage: "writing", title: "Pages" },
];

type PageStatus =
  | { state: "waiting" }
  | { state: "writing" }
  | { state: "done"; entryId: string; path: string; todos: number | null }
  | { state: "failed"; error: string };

type Reply<T> = ({ ok: true } & T) | { ok: false; error: string };

// A rough guess at the tokens per page, from the spike (decisions #134), for the confirmation.
const TOKENS_PER_PAGE = 10_000;
const AT_ONCE = 3;

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<Reply<T>> {
  try {
    const response = await fetch(`/admin/api/ai/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    const json = (await response.json().catch(() => null)) as Reply<T> | null;
    if (json && typeof json === "object" && "ok" in json) return json;
    return { ok: false, error: "Something went wrong. Try again." };
  } catch {
    if (signal?.aborted) return { ok: false, error: "Stopped." };
    return { ok: false, error: "The server couldn't be reached. Try again." };
  }
}

export function CreateWithAi({ provider, model }: { provider: string; model: string }) {
  const id = useId();
  const [stage, setStageState] = useState<Stage>("describe");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [brief, setBrief] = useState("");
  const [interview, setInterview] = useState<AiInterview | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});

  const [plan, setPlan] = useState<SitePlan | null>(null);
  const [batchId, setBatchId] = useState("");
  const [ids, setIds] = useState<Record<string, string>>({});
  const [keep, setKeep] = useState<Record<string, boolean>>({});
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [siteTitle, setSiteTitle] = useState("");
  const [confirming, setConfirming] = useState(false);

  const [status, setStatus] = useState<Record<string, PageStatus>>({});
  const stop = useRef<AbortController | null>(null);
  const [finish, setFinish] = useState({ menus: true, homepage: true, siteTitle: true });
  const [finished, setFinished] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  // What the last design came to, shown above the next one: a discard's result.
  const [notice, setNotice] = useState<string | null>(null);

  // Focus moves to each new step's heading (Stepper: a screen reader isn't told otherwise), but
  // not on arriving at the page.
  const moved = useRef(false);
  const setStage = (next: Stage) => {
    moved.current = true;
    setStageState(next);
  };
  const heading = useCallback((element: HTMLHeadingElement | null) => {
    if (element && moved.current) element.focus();
  }, []);

  const answered = (q: AiQuestion): string | string[] => {
    const chosen = answers[q.id];
    const extra = (other[q.id] ?? "").trim();
    if (q.kind === "multiple") {
      const list = Array.isArray(chosen) ? chosen : [];
      return extra ? [...list, extra].slice(0, 6) : list;
    }
    if (q.kind === "single") return extra || (typeof chosen === "string" ? chosen : "");
    return typeof chosen === "string" ? chosen : "";
  };
  const answerList = () =>
    (interview?.questions ?? []).map((q) => ({ question: q.question, answer: answered(q) }));

  // ── Steps ──────────────────────────────────────────────────────────────────────────────────

  async function askQuestions() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const reply = await post<{ interview: AiInterview }>("questions", { brief });
    setBusy(false);
    if (!reply.ok) return setError(reply.error);
    setInterview(reply.interview);
    setAnswers({});
    setOther({});
    setStage(reply.interview.questions.length ? "questions" : "plan");
    if (!reply.interview.questions.length) await makePlan([]);
  }

  async function makePlan(list = answerList()) {
    setBusy(true);
    setError(null);
    const reply = await post<{ batchId: string; plan: SitePlan; ids: Record<string, string> }>(
      "plan",
      { brief, answers: list },
    );
    setBusy(false);
    if (!reply.ok) return setError(reply.error);
    setPlan(reply.plan);
    setBatchId(reply.batchId);
    setIds(reply.ids);
    setKeep(Object.fromEntries(reply.plan.pages.map((p) => [p.ref, true])));
    setTitles(Object.fromEntries(reply.plan.pages.map((p) => [p.ref, p.title])));
    setSiteTitle(reply.plan.siteTitle);
    setStage("plan");
  }

  // The plan as edited: pages left out (and the pages under them), titles changed.
  function editedPlan(): { plan: SitePlan; ids: Record<string, string> } | null {
    if (!plan) return null;
    const kept = new Set<string>();
    for (const page of plan.pages) {
      if (keep[page.ref] !== false && (page.parentRef === null || kept.has(page.parentRef))) {
        kept.add(page.ref);
      }
    }
    const pages = plan.pages
      .filter((p) => kept.has(p.ref))
      .map((p) => ({ ...p, title: (titles[p.ref] ?? p.title).trim() || p.title }));
    return {
      plan: {
        ...plan,
        siteTitle: siteTitle.trim() || plan.siteTitle,
        pages,
        primaryMenu: plan.primaryMenu.filter((ref) => kept.has(ref)),
        footerMenu: plan.footerMenu.filter((ref) => kept.has(ref)),
      },
      ids: Object.fromEntries(Object.entries(ids).filter(([ref]) => kept.has(ref))),
    };
  }

  // Writes the pages not done yet: three at a time, a page only once its parent is written.
  async function writePages(only?: string) {
    const edited = editedPlan();
    if (!edited) return;
    setStage("writing");
    setError(null);
    const controller = new AbortController();
    stop.current = controller;
    const states: Record<string, PageStatus> = { ...status };
    for (const page of edited.plan.pages) {
      const done = states[page.ref]?.state === "done";
      if (!done && (!only || page.ref === only)) states[page.ref] = { state: "waiting" };
    }
    setStatus({ ...states });
    const update = (ref: string, next: PageStatus) => {
      states[ref] = next;
      setStatus({ ...states });
    };

    const running = new Set<Promise<void>>();
    const waiting = () => edited.plan.pages.filter((p) => states[p.ref]?.state === "waiting");
    while (!controller.signal.aborted) {
      const ready = waiting().filter(
        (p) => p.parentRef === null || states[p.parentRef]?.state === "done",
      );
      // A page whose parent failed can't be written: it waits for a retry of the parent.
      for (const page of waiting()) {
        const parent = page.parentRef ? states[page.parentRef] : undefined;
        if (parent?.state === "failed") {
          update(page.ref, { state: "failed", error: "Its parent page wasn't written." });
        }
      }
      if (ready.length === 0 && running.size === 0) break;
      for (const page of ready.slice(0, AT_ONCE - running.size)) {
        update(page.ref, { state: "writing" });
        const job = post<{ entryId: string; path: string; todos: number | null }>(
          "page",
          {
            batchId,
            brief,
            answers: answerList(),
            plan: edited.plan,
            ids: edited.ids,
            ref: page.ref,
          },
          controller.signal,
        ).then((reply) => {
          update(
            page.ref,
            reply.ok
              ? { state: "done", entryId: reply.entryId, path: reply.path, todos: reply.todos }
              : { state: "failed", error: reply.error },
          );
        });
        const tracked = job.finally(() => running.delete(tracked));
        running.add(tracked);
      }
      if (running.size > 0) await Promise.race(running);
    }
    for (const page of waiting()) update(page.ref, { state: "failed", error: "Stopped." });
    stop.current = null;
    setStage("done");
  }

  async function applyFinish() {
    const edited = editedPlan();
    if (!edited) return;
    setBusy(true);
    setError(null);
    const reply = await post("finish", {
      batchId,
      plan: edited.plan,
      ids: edited.ids,
      menus: finish.menus,
      homepage: finish.homepage,
      siteTitle: finish.siteTitle,
    });
    setBusy(false);
    if (!reply.ok) return setError(reply.error);
    setFinished(true);
  }

  // Back to the first step with nothing held: a design is finished or discarded, and the
  // next one starts clean. `keepBrief` after a discard, to try the same site again.
  function startOver(keepBrief: boolean) {
    if (!keepBrief) setBrief("");
    setInterview(null);
    setAnswers({});
    setOther({});
    setPlan(null);
    setBatchId("");
    setIds({});
    setKeep({});
    setTitles({});
    setSiteTitle("");
    setStatus({});
    setFinish({ menus: true, homepage: true, siteTitle: true });
    setFinished(false);
    setError(null);
    setStage("describe");
  }

  async function discard() {
    setDiscarding(false);
    setBusy(true);
    setError(null);
    const reply = await post<{ trashed: number; kept: { id: string; title: string }[] }>(
      "discard",
      { batchId, includeEdited: false },
    );
    setBusy(false);
    if (!reply.ok) return setError(reply.error);
    const kept = reply.kept.length
      ? ` ${reply.kept.length} you changed since ${reply.kept.length === 1 ? "was" : "were"} kept: ${reply.kept.map((k) => k.title).join(", ")}.`
      : "";
    setNotice(
      `The design was discarded: ${reply.trashed} ${reply.trashed === 1 ? "page was" : "pages were"} moved to the trash${finished ? ", and the menus and settings put back" : ""}.${kept}`,
    );
    startOver(true);
  }

  // ── Drawing ────────────────────────────────────────────────────────────────────────────────

  const step = stage === "done" ? 5 : STEPS.findIndex((s) => s.stage === stage) + 1;
  const edited = stage === "plan" ? editedPlan() : null;
  const pages = (editedPlan()?.plan.pages ?? []).filter((p) => status[p.ref] || stage === "plan");
  const doneCount = Object.values(status).filter((s) => s.state === "done").length;
  const failed = pages.filter((p) => status[p.ref]?.state === "failed");

  return (
    <div className="create-with-ai">
      <Stepper value={step} aria-label="Creating a site" className="create-with-ai__steps">
        {STEPS.map((s, index) => (
          <StepperItem key={s.stage} step={index + 1}>
            <StepperIndicator />
            <StepperContent>
              <StepperTitle>{s.title}</StepperTitle>
            </StepperContent>
          </StepperItem>
        ))}
      </Stepper>

      {notice ? (
        <Alert intent="success" role="status">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert intent="danger" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {stage === "describe" ? (
        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h2 ref={heading} tabIndex={-1}>
                Describe the site
              </h2>
            </CardTitle>
            <CardDescription>
              A few sentences on the business or project and what the site is for. The assistant
              asks a few questions next, then plans the pages.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field required>
              <FieldLabel>Description</FieldLabel>
              <FieldControl>
                <Textarea
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  rows={5}
                  maxLength={3000}
                  placeholder="A website for our family bakery in Ghent. People should find us and order birthday cakes."
                />
              </FieldControl>
              <FieldDescription>
                {brief.trim().length} of 3,000 characters. It's sent to {provider} with your
                answers, nothing else from the site.
              </FieldDescription>
            </Field>
          </CardContent>
          <CardFooter>
            <Button
              onClick={askQuestions}
              disabled={busy || brief.trim().length < 20}
              aria-busy={busy}
            >
              {busy ? <Spinner size="sm" label="" /> : null}
              {busy ? "Thinking…" : "Next"}
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {stage === "questions" && interview ? (
        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h2 ref={heading} tabIndex={-1}>
                A few questions
              </h2>
            </CardTitle>
            <CardDescription>{interview.summary}</CardDescription>
          </CardHeader>
          <CardContent className="create-with-ai__questions">
            {interview.questions.map((q) => (
              <Question
                key={q.id}
                id={`${id}-${q.id}`}
                question={q}
                value={answers[q.id]}
                other={other[q.id] ?? ""}
                onValue={(value) => setAnswers((now) => ({ ...now, [q.id]: value }))}
                onOther={(value) => setOther((now) => ({ ...now, [q.id]: value }))}
              />
            ))}
          </CardContent>
          <CardFooter className="create-with-ai__actions">
            <Button intent="secondary" onClick={() => setStage("describe")} disabled={busy}>
              Back
            </Button>
            <Button onClick={() => makePlan()} disabled={busy} aria-busy={busy}>
              {busy ? <Spinner size="sm" label="" /> : null}
              {busy ? "Planning the site…" : "Plan the site"}
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {stage === "plan" && plan && edited ? (
        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h2 ref={heading} tabIndex={-1}>
                The plan
              </h2>
            </CardTitle>
            <CardDescription>
              Leave out pages you don't want and change their titles. Each page is written as a
              draft; nothing is published.
            </CardDescription>
          </CardHeader>
          <CardContent className="create-with-ai__plan">
            <Field>
              <FieldLabel>Site title</FieldLabel>
              <FieldControl>
                <Input
                  value={siteTitle}
                  onChange={(event) => setSiteTitle(event.target.value)}
                  maxLength={120}
                />
              </FieldControl>
            </Field>
            <ul className="create-with-ai__pages">
              {plan.pages.map((page, index) => {
                const included = edited.plan.pages.some((p) => p.ref === page.ref);
                return (
                  <li
                    key={page.ref}
                    className={`create-with-ai__page${page.parentRef ? " create-with-ai__page--child" : ""}`}
                  >
                    <div className="create-with-ai__page-head">
                      <Checkbox
                        id={`${id}-keep-${page.ref}`}
                        checked={included}
                        disabled={
                          index === 0 ||
                          (page.parentRef !== null &&
                            !edited.plan.pages.some((p) => p.ref === page.parentRef))
                        }
                        onCheckedChange={(state) =>
                          setKeep((now) => ({ ...now, [page.ref]: state === true }))
                        }
                        aria-label={`Write ${titles[page.ref] ?? page.title}`}
                      />
                      <Input
                        value={titles[page.ref] ?? page.title}
                        onChange={(event) =>
                          setTitles((now) => ({ ...now, [page.ref]: event.target.value }))
                        }
                        maxLength={120}
                        aria-label="Page title"
                        disabled={!included}
                        className="create-with-ai__title"
                      />
                      {index === 0 ? <Badge intent="primary">Home</Badge> : null}
                    </div>
                    <p className="create-with-ai__purpose">{page.purpose}</p>
                    <p className="create-with-ai__sections">
                      {page.sections.map((s) => s.about).join(" · ")}
                    </p>
                  </li>
                );
              })}
            </ul>
          </CardContent>
          <CardFooter className="create-with-ai__actions">
            <Button
              intent="secondary"
              onClick={() => setStage(interview?.questions.length ? "questions" : "describe")}
            >
              Back
            </Button>
            <Button onClick={() => setConfirming(true)}>
              Write {edited.plan.pages.length} {edited.plan.pages.length === 1 ? "page" : "pages"}
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {stage === "writing" || stage === "done" ? (
        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h2 ref={heading} tabIndex={-1}>
                {stage === "writing" ? "Writing the pages" : "The pages"}
              </h2>
            </CardTitle>
            <CardDescription>
              {stage === "writing"
                ? "Three at a time, each page under its parent. You can leave this screen open while it works."
                : "Each page is a draft. Open one to check it, fill in what's marked [TODO], and publish it."}
            </CardDescription>
          </CardHeader>
          <CardContent className="create-with-ai__results">
            <Progress
              value={doneCount}
              max={Math.max(pages.length, 1)}
              aria-label="Pages written"
              getValueLabel={(value, max) => `${value} of ${max} pages written`}
            />
            <ul className="create-with-ai__list" aria-live="polite">
              {pages.map((page) => {
                const s = status[page.ref] ?? { state: "waiting" };
                return (
                  <li key={page.ref} className="create-with-ai__row">
                    <span className="create-with-ai__row-title">
                      {s.state === "done" ? (
                        <Link href={`/admin/pages/${s.entryId}`}>{page.title}</Link>
                      ) : (
                        page.title
                      )}
                    </span>
                    {s.state === "waiting" ? <Badge>Waiting</Badge> : null}
                    {s.state === "writing" ? (
                      <Badge intent="primary">
                        <Spinner size="sm" label="" /> Writing
                      </Badge>
                    ) : null}
                    {s.state === "done" ? (
                      <Badge intent="success">
                        Draft{s.todos ? `, ${s.todos} to fill in` : ""}
                      </Badge>
                    ) : null}
                    {s.state === "failed" ? <Badge intent="danger">Not written</Badge> : null}
                    {s.state === "failed" ? (
                      <span className="create-with-ai__row-error">{s.error}</span>
                    ) : null}
                    {s.state === "failed" && stage === "done" ? (
                      <Button size="sm" intent="secondary" onClick={() => writePages(page.ref)}>
                        Try again
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </CardContent>
          {stage === "writing" ? (
            <CardFooter>
              <Button intent="secondary" onClick={() => stop.current?.abort()}>
                Stop
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      ) : null}

      {stage === "done" ? (
        <Card>
          <CardHeader>
            <CardTitle>Finish</CardTitle>
            <CardDescription>
              {finished
                ? "Applied. The menus link the pages once they're published. Discarding the design still puts back what this replaced."
                : "Use the plan's menus, home page and title for the site. Discarding the design later puts back what these replace."}
            </CardDescription>
          </CardHeader>
          {!finished ? (
            <CardContent className="create-with-ai__finish">
              {(
                [
                  ["menus", "Use the planned menus", "Replaces the main and footer menus."],
                  ["homepage", "Make the first page the home page", "Once it's published."],
                  [
                    "siteTitle",
                    "Use the site title and tagline",
                    `"${siteTitle || plan?.siteTitle}"`,
                  ],
                ] as const
              ).map(([key, label, note]) => (
                <Field key={key} orientation="horizontal">
                  <FieldControl>
                    <Checkbox
                      checked={finish[key]}
                      onCheckedChange={(state) =>
                        setFinish((now) => ({ ...now, [key]: state === true }))
                      }
                    />
                  </FieldControl>
                  <FieldLabel>{label}</FieldLabel>
                  <FieldDescription>{note}</FieldDescription>
                </Field>
              ))}
            </CardContent>
          ) : null}
          <CardFooter className="create-with-ai__actions">
            {finished ? (
              <>
                <Button asChild>
                  <Link href="/admin/pages">Go to Pages</Link>
                </Button>
                <Button intent="secondary" onClick={() => startOver(false)}>
                  Design another site
                </Button>
              </>
            ) : null}
            {!finished ? (
              <Button
                onClick={applyFinish}
                disabled={busy || doneCount === 0 || failed.length === pages.length}
                aria-busy={busy}
              >
                Apply
              </Button>
            ) : null}
            <Button intent="ghost" onClick={() => setDiscarding(true)} disabled={busy}>
              Discard this design
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent size="sm">
          <AlertDialogTitle>Write {edited?.plan.pages.length ?? 0} pages?</AlertDialogTitle>
          <AlertDialogDescription>
            {provider} ({model}) writes them, using roughly{" "}
            {((edited?.plan.pages.length ?? 0) * TOKENS_PER_PAGE).toLocaleString()} tokens; it's a
            rough guess. Each page is a draft, and nothing is published.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false);
                void writePages();
              }}
            >
              Write the pages
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discarding} onOpenChange={setDiscarding}>
        <AlertDialogContent size="sm">
          <AlertDialogTitle>Discard this design?</AlertDialogTitle>
          <AlertDialogDescription>
            Its pages go to the trash
            {finished ? ", and the menus, home page and title it set are put back" : ""}. Pages
            you've changed since are kept.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction intent="danger" onClick={discard}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// One question: options to pick, with room for an answer of one's own, or a line of text.
function Question({
  id,
  question,
  value,
  other,
  onValue,
  onOther,
}: {
  id: string;
  question: AiQuestion;
  value: string | string[] | undefined;
  other: string;
  onValue: (value: string | string[]) => void;
  onOther: (value: string) => void;
}) {
  if (question.kind === "text") {
    return (
      <Field>
        <FieldLabel>{question.question}</FieldLabel>
        <FieldControl>
          <Textarea
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onValue(event.target.value)}
            rows={2}
            maxLength={600}
          />
        </FieldControl>
      </Field>
    );
  }
  const otherField = (
    <Field>
      <FieldLabel>Something else</FieldLabel>
      <FieldControl>
        <Input value={other} onChange={(event) => onOther(event.target.value)} maxLength={600} />
      </FieldControl>
    </Field>
  );
  if (question.kind === "single") {
    return (
      <Fieldset className="create-with-ai__question">
        <FieldsetLegend>{question.question}</FieldsetLegend>
        <RadioGroup value={typeof value === "string" ? value : ""} onValueChange={onValue}>
          {question.options.map((option, i) => (
            <div key={option} className="create-with-ai__option">
              <RadioGroupItem value={option} id={`${id}-${i}`} />
              <label htmlFor={`${id}-${i}`}>{option}</label>
            </div>
          ))}
        </RadioGroup>
        {otherField}
      </Fieldset>
    );
  }
  const chosen = Array.isArray(value) ? value : [];
  return (
    <Fieldset className="create-with-ai__question">
      <FieldsetLegend>{question.question}</FieldsetLegend>
      {question.options.map((option, i) => (
        <div key={option} className="create-with-ai__option">
          <Checkbox
            id={`${id}-${i}`}
            checked={chosen.includes(option)}
            onCheckedChange={(state) =>
              onValue(state === true ? [...chosen, option] : chosen.filter((c) => c !== option))
            }
          />
          <label htmlFor={`${id}-${i}`}>{option}</label>
        </div>
      ))}
      {otherField}
    </Fieldset>
  );
}
