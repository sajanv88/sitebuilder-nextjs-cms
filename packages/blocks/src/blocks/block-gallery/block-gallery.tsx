import { GridIcon } from "@nuvui/icons";
import {
  AspectRatio,
  Carousel,
  CarouselContent,
  CarouselDots,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@nuvui/react";
import * as v from "valibot";
import { BlockPlaceholder } from "../../placeholder/block-placeholder";
import { mediaId } from "../../shared";
import type { BlockDefinition, RenderMedia } from "../../types";
import { MediaImage } from "../block-image/block-image";
import "./block-gallery.scss";

const Props = v.strictObject({
  mediaIds: v.pipe(v.array(mediaId), v.minLength(1, "Choose at least one image"), v.maxLength(24)),
  layout: v.optional(v.picklist(["carousel", "grid"]), "grid"),
});
type Props = v.InferOutput<typeof Props>;

export const gallery: BlockDefinition<Props> = {
  type: "gallery",
  label: "Gallery",
  description: "Several images, in a grid or a carousel.",
  category: "media",
  icon: GridIcon,
  props: Props,
  defaults: () => ({ mediaIds: [], layout: "grid" }),
  fields: [
    { kind: "media-list", name: "mediaIds", label: "Images", accept: "image", max: 24 },
    {
      kind: "choice",
      name: "layout",
      label: "Layout",
      options: [
        { value: "grid", label: "Grid" },
        { value: "carousel", label: "Carousel" },
      ],
    },
  ],
  summary: (props) => `Gallery, ${props.mediaIds.length} images`,
  Render: ({ props, context }) => {
    // Files deleted since the gallery was made are left out.
    const images = props.mediaIds
      .map((id) => context.media(id))
      .filter((media): media is RenderMedia => media?.mimeType.startsWith("image/") === true);
    if (images.length === 0) {
      return context.editing ? (
        <BlockPlaceholder icon={GridIcon}>Choose images</BlockPlaceholder>
      ) : null;
    }

    if (props.layout === "carousel") {
      return (
        <Carousel aria-label="Gallery" className="block-gallery">
          <CarouselContent>
            {images.map((media) => (
              <CarouselItem key={media.id}>
                <AspectRatio ratio={4 / 3}>
                  <MediaImage media={media} alt={media.alt ?? ""} />
                </AspectRatio>
              </CarouselItem>
            ))}
          </CarouselContent>
          <div className="block-gallery__controls">
            <CarouselPrevious />
            <CarouselDots />
            <CarouselNext />
          </div>
        </Carousel>
      );
    }

    return (
      <ul className="block-gallery block-gallery--grid">
        {images.map((media) => (
          <li key={media.id}>
            <AspectRatio ratio={1}>
              <MediaImage media={media} alt={media.alt ?? ""} />
            </AspectRatio>
          </li>
        ))}
      </ul>
    );
  },
};
