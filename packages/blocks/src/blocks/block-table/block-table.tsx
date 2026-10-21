import { TableIcon } from "@nuvui/icons";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@nuvui/table/table";
import * as v from "valibot";
import { text } from "../../shared";
import type { BlockDefinition } from "../../types";

const Cell = v.pipe(v.string(), v.trim(), v.maxLength(200));

const Props = v.pipe(
  v.strictObject({
    // Required: nuvui's tables need a name (design §5.5).
    caption: text(200),
    columns: v.pipe(v.array(text(80)), v.minLength(1, "Add at least one column"), v.maxLength(8)),
    rows: v.pipe(v.array(v.array(Cell)), v.maxLength(100)),
  }),
  v.check(
    (table) => table.rows.every((row) => row.length === table.columns.length),
    "Every row needs one cell for each column",
  ),
);
type Props = v.InferOutput<typeof Props>;

// A table written out by hand, on @nuvui/table's styled elements (its plain-table entry, which
// leaves the data table out). The first cell of each row is that row's heading.
export const table: BlockDefinition<Props> = {
  type: "table",
  label: "Table",
  description: "Rows and columns of text, with a caption.",
  category: "data",
  icon: TableIcon,
  props: Props,
  defaults: () => ({
    caption: "A table",
    columns: ["Name", "Value"],
    rows: [
      ["First", "1"],
      ["Second", "2"],
    ],
  }),
  fields: [
    {
      kind: "text",
      name: "caption",
      label: "Caption",
      max: 200,
      description: "What the table shows. Screen readers say it as the table's name.",
    },
    {
      kind: "strings",
      name: "columns",
      label: "Columns",
      itemLabel: "Column",
      min: 1,
      max: 8,
      maxLength: 80,
    },
    { kind: "rows", name: "rows", label: "Rows", columnsFrom: "columns", max: 100, maxLength: 200 },
  ],
  summary: (props) => props.caption,
  Render: ({ props }) => (
    <TableContainer aria-label={props.caption}>
      <Table>
        <TableCaption>{props.caption}</TableCaption>
        <TableHeader>
          <TableRow>
            {props.columns.map((label, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: column labels may repeat; their order is their identity.
              <TableHead key={index}>{label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.rows.map((row, rowIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no ids; the table is drawn whole from stored props.
            <TableRow key={rowIndex}>
              {row.map((cell, cellIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: as above.
                <TableCell key={cellIndex} rowHeader={cellIndex === 0}>
                  {/* An empty cell says so, so a screen reader has something to read. */}
                  {cell || "—"}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  ),
};
