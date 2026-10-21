import { FileTextIcon } from "@nuvui/icons";
import { Card, CardDescription, CardHeader, CardTitle } from "@nuvui/react";
import { formatDate, Uuid } from "@sitebuilder/schema";
import * as v from "valibot";
import { BlockPlaceholder } from "../../placeholder/block-placeholder";
import type { BlockDefinition, PostSummary, RenderContext } from "../../types";
import "./block-latest-posts.scss";

const Props = v.strictObject({
  count: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(24)), 3),
  // Only posts with one of these categories or tags; none means every post.
  termIds: v.optional(v.pipe(v.array(Uuid), v.maxLength(50))),
  layout: v.optional(v.picklist(["list", "cards"]), "cards"),
  showExcerpt: v.optional(v.boolean(), true),
});
type Props = v.InferOutput<typeof Props>;

function pick(posts: readonly PostSummary[], props: Props): PostSummary[] {
  const terms = props.termIds ?? [];
  const matching =
    terms.length === 0
      ? posts
      : posts.filter((post) => post.termIds.some((id) => terms.includes(id)));
  return matching.slice(0, props.count);
}

function PostDate({ post, context }: { post: PostSummary; context: RenderContext }) {
  const { language, ...settings } = context.dates;
  return (
    <time className="block-latest-posts__date" dateTime={post.publishedAt}>
      {formatDate(new Date(post.publishedAt), settings, language)}
    </time>
  );
}

// The newest public posts. The page that draws it hands the posts over in the render context.
export const latestPosts: BlockDefinition<Props> = {
  type: "latest-posts",
  label: "Latest posts",
  description: "The newest posts, as a list or as cards.",
  category: "data",
  icon: FileTextIcon,
  props: Props,
  defaults: () => ({ count: 3, layout: "cards", showExcerpt: true }),
  fields: [
    { kind: "number", name: "count", label: "How many", min: 1, max: 24 },
    {
      kind: "terms",
      name: "termIds",
      label: "Only from these categories and tags",
      description: "Leave empty for every post.",
    },
    {
      kind: "choice",
      name: "layout",
      label: "Layout",
      options: [
        { value: "cards", label: "Cards" },
        { value: "list", label: "List" },
      ],
    },
    { kind: "toggle", name: "showExcerpt", label: "Show each post's excerpt" },
  ],
  summary: (props) => `Latest ${props.count} posts`,
  Render: ({ props, context }) => {
    const posts = pick(context.posts, props);
    if (posts.length === 0) {
      return context.editing ? (
        <BlockPlaceholder icon={FileTextIcon}>No published posts match yet</BlockPlaceholder>
      ) : null;
    }
    if (props.layout === "list") {
      return (
        <ul className="block-latest-posts block-latest-posts--list">
          {posts.map((post) => (
            <li key={post.id} className="block-latest-posts__item">
              <a className="block-latest-posts__link" href={post.path}>
                {post.title}
              </a>
              <PostDate post={post} context={context} />
              {props.showExcerpt && post.excerpt ? (
                <p className="block-latest-posts__excerpt">{post.excerpt}</p>
              ) : null}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <ul className="block-latest-posts block-latest-posts--cards">
        {posts.map((post) => (
          <li key={post.id}>
            <Card className="block-latest-posts__card">
              <CardHeader>
                <CardTitle asChild>
                  <h3>
                    <a className="block-latest-posts__link" href={post.path}>
                      {post.title}
                    </a>
                  </h3>
                </CardTitle>
                <PostDate post={post} context={context} />
                {props.showExcerpt && post.excerpt ? (
                  <CardDescription>{post.excerpt}</CardDescription>
                ) : null}
              </CardHeader>
            </Card>
          </li>
        ))}
      </ul>
    );
  },
};
