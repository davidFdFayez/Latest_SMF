import { cleanCrop } from '../utils/bannerCrop';
import PositionedBanner from './PositionedBanner';

/**
 * A card's banner image (`.fed-nav-card__img`, 16:9). A banner the admin has
 * positioned keeps that composition inside the card's frame; any other image
 * stays the plain <img> it always was, with the card's default crop.
 */
export default function CardBanner({ src, crop, className = '' }) {
  const classes = ['fed-nav-card__img', className].filter(Boolean).join(' ');

  if (!cleanCrop(crop)) return <img className={classes} src={src} alt="" loading="lazy" />;

  return <PositionedBanner className={`${classes} fed-nav-card__img--framed`} src={src} crop={crop} loading="lazy" />;
}
