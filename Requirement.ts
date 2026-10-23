import { IConstructor } from '@civ-clone/core-registry/Registry';

/**
 * A state the graph can name but not evaluate, such as `civ1-unit:coastal-city`: whether it holds depends on the map,
 * the city or the game, so a hand-written rule decides it. The entry gives the civilopedia a line to show for it.
 */
export class Condition {
  readonly id: string;

  constructor(id: string) {
    this.id = id;
  }
}

/** What a requirement is about, or what it needs: a class (an advance, a unit, a Wonder…) or a `Condition`. */
export type Target = IConstructor | Condition;

/** Whose possession counts: this tile's, this city's, this player's, or anyone's in the world. */
export type Range = 'tile' | 'city' | 'player' | 'world';

declare global {
  /**
   * How a requirement's subject relates to its targets. A plugin adds its own by declaration merging:
   *
   * ```ts
   * declare global {
   *   interface RequirementRelationMap {
   *     enhancedBy: true;
   *   }
   * }
   * ```
   */
  interface RequirementRelationMap {
    /** Available only while the targets are met. */
    requires: true;
    /** Unavailable while the targets are met. */
    excludedBy: true;
    /** Stops being available, or working, once the targets are met. */
    obsoletedBy: true;
    /** What takes its place once it is obsolete. Only says so: no rule is made from it. */
    replacedBy: true;
  }
}

export type Relation = keyof RequirementRelationMap;

export interface IRequirementOptions {
  /** How `targets` combine: all of them (the default) or any one. */
  mode?: 'all' | 'any';
  /** Whose possession of the targets counts: the player's unless it says otherwise. */
  range?: Range;
  /** Only where the subject is on one of these, e.g. a road on a River needing Bridge Building. */
  where?: IConstructor[];
}

export interface IRequirement extends IRequirementOptions {
  /** The same string as the rule made from it, e.g. `civ1-unit:city/build/obsolete/Musketman`. */
  id: string;
  /** The class it is about. An entry on a superclass (e.g. `Naval`) is about every class that extends it too. */
  subject: IConstructor;
  relation: Relation;
  targets: Target[];
}

/**
 * One edge of the graph: `subject` `relation` `targets`, such as "Musketman requires Gunpowder". Entries are data:
 * what a ruleset says, kept where the civilopedia can read it and a plugin can change it. Play never reads them; it
 * runs the rules each entry was made into.
 *
 * An entry is frozen: a ruleset's are shared by every game, and the rules made from them read them as they run, so a
 * change to one would change play everywhere. A plugin changes an entry by replacing it in a game's registry.
 */
export class Requirement {
  readonly id: string;
  readonly mode: 'all' | 'any';
  readonly range: Range;
  readonly relation: Relation;
  readonly subject: IConstructor;
  readonly targets: readonly Target[];
  readonly where: readonly IConstructor[] | null;

  constructor({
    id,
    subject,
    relation,
    targets,
    mode = 'all',
    range = 'player',
    where,
  }: IRequirement) {
    if (
      typeof id !== 'string' ||
      id === '' ||
      typeof subject !== 'function' ||
      !Array.isArray(targets)
    ) {
      throw new TypeError(
        `A requirement needs an id, a subject class and a list of targets: '${id}' has not got them all.`
      );
    }

    this.id = id;
    this.subject = subject;
    this.relation = relation;
    this.targets = Object.freeze([...targets]);
    this.mode = mode;
    this.range = range;
    this.where = where ? Object.freeze([...where]) : null;

    Object.freeze(this);
  }
}

/**
 * Whether `entry`'s targets are met, given how to tell whether one target is: all of them, or any one. Whether being
 * met makes the subject available (`requires`) or not (`obsoletedBy`, `excludedBy`) is for the caller to say.
 */
export const met = (
  entry: Requirement,
  has: (target: Target) => boolean
): boolean =>
  entry.mode === 'any' ? entry.targets.some(has) : entry.targets.every(has);

/**
 * Entries from a table of rows, each a subject and its targets, with ids made from `idPrefix` and the subject's name:
 *
 * ```ts
 * table('civ1-unit:city/build/obsolete', 'obsoletedBy', [
 *   [Spearman, Gunpowder],
 *   [Musketman, Conscription],
 * ]);
 * // civ1-unit:city/build/obsolete/Spearman, civ1-unit:city/build/obsolete/Musketman
 * ```
 */
export const table = (
  idPrefix: string,
  relation: Relation,
  rows: [IConstructor, ...Target[]][],
  options: IRequirementOptions = {}
): Requirement[] =>
  rows.map(
    ([subject, ...targets]): Requirement =>
      new Requirement({
        id: `${idPrefix}/${subject.name}`,
        subject,
        relation,
        targets,
        ...options,
      })
  );

export default Requirement;
