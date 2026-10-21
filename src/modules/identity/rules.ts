// Account rules shared by the service and the forms (FR-AUTH-03/07, FR-ADM-01/02, FR-ADM-16).
import { z } from 'zod';

// Short, familiar words: students copy these from a paper login slip. Three words and two digits give about
// 29 bits (M7, owner's decision): with failed sign-ins limited per username and per address (sign-in-limit.ts),
// guessing any one of the club's accounts takes years. Admin can reset any password at once.
export const PASSWORD_WORDS = (
  'apple bamboo banana basket beach berry bike bird boat bread brick bridge brush bubble bucket bunny cactus camel ' +
  'candle canoe carrot castle cat cloud clover coconut comet cookie coral crayon cricket crown cupcake daisy desert ' +
  'dolphin donut dragon drum duck eagle earth falcon feather fern fiddle flame flower forest fox frog galaxy garden ' +
  'gecko ginger giraffe glacier goose grape guitar hammer harbor hippo honey igloo island jacket jaguar jelly jungle ' +
  'kayak kettle kite koala ladder lagoon lantern lemon leopard lion lizard lotus magnet mango maple marble meadow ' +
  'melon meteor mint monkey moon mountain muffin noodle ocean octopus olive orange orbit otter owl panda papaya ' +
  'parrot peach peanut pebble pelican pencil penguin pepper piano pickle pillow pine pirate pixel planet plum pony ' +
  'puffin pumpkin puzzle quartz rabbit radar rainbow raven river robot rocket rose saddle sailor salmon sandal ' +
  'saturn shark shell sky sloth snail snow sock sparrow spider spoon squid star sugar sun sunset tiger toast tomato ' +
  'tractor tulip turtle umbrella valley violin volcano waffle walrus whale willow window wizard wolf yacht zebra'
).split(' ');

const randomInt = (max: number) => crypto.getRandomValues(new Uint32Array(1))[0]! % max;

const word = () => PASSWORD_WORDS[randomInt(PASSWORD_WORDS.length)];

export function generatePassword(): string {
  return `${word()}-${word()}-${word()}-${10 + randomInt(90)}`;
}

const USERNAME_RE = /^[a-z0-9_](?:[a-z0-9_.]*[a-z0-9_])?$/;
export const usernameSchema = z
  .string()
  .min(3, 'Usernames are at least 3 characters.')
  .max(30, 'Usernames are at most 30 characters.')
  .regex(USERNAME_RE, 'Use lower-case letters, digits, dots or underscores (not at the start or end).')
  .refine((u) => !u.includes('..'), 'Usernames cannot contain "..".');

export function suggestUsername(fullName: string, taken: Set<string>): string {
  const parts = fullName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z]/g, ''))
    .filter(Boolean);
  const first = (parts[0] ?? '').slice(0, 25);
  const base = parts.length > 1 ? `${first}.${parts[parts.length - 1]![0]}` : first;
  if (base.length < 3) {
    let i = 1;
    while (taken.has(`user${i}`)) i++;
    return `user${i}`;
  }
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

const optionalText = (max: number, label: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(max, `${label} is too long.`).optional(),
  );

export const accountInputSchema = z.object({
  role: z.enum(['student', 'teacher', 'admin'], { message: 'Choose Student, Teacher or Admin.' }),
  name: z.string().trim().min(1, "Enter the person's full name.").max(100, 'That name is too long.'),
  username: z.preprocess((v) => (v === '' || v == null ? undefined : String(v).trim().toLowerCase()), usernameSchema.optional()),
  guardianName: optionalText(100, 'Guardian name'),
  guardianPhone: optionalText(30, 'Guardian phone'),
  phone: optionalText(30, 'Phone'),
  notes: optionalText(1000, 'Notes'),
});
export type AccountInput = z.input<typeof accountInputSchema>;

export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
