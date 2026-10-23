import {
  Condition,
  IRequirement,
  Relation,
  Requirement,
  Target,
} from './Requirement';
import {
  DuplicateRuleIdError,
  RuleRegistry,
  instance as ruleRegistryInstance,
} from '@civ-clone/core-rule/RuleRegistry';
import { EntityRegistry } from '@civ-clone/core-registry/EntityRegistry';
import { IConstructor } from '@civ-clone/core-registry/Registry';
import Rule from '@civ-clone/core-rule/Rule';

/**
 * The rules an entry is played by, made by the package that owns it: it knows how to tell whether a player has an
 * advance, a city has an improvement, and so on, so this package needn't. The registry is passed too, for a rule that
 * folds several entries into one (a government available by any of several paths).
 */
export type Deriver = (
  entry: Requirement,
  requirements: RequirementRegistry
) => Rule[];

export class UnknownRequirementError extends Error {}
export class DuplicateRequirementIdError extends Error {}

/**
 * Every requirement a ruleset declares, and the rules made from each (civ-clone/web-renderer#37).
 *
 * The rules are what play runs, under the entries' own ids, exactly as if they had been written out; this registry is
 * only read when something asks about the graph (the civilopedia, "why can't I build this?"). Changing an entry
 * changes its rules with it, so a plugin edits one place and the civilopedia never says one thing while the game does
 * another.
 *
 * `rules.replace` on a derived rule still works, as the way out for behaviour the graph can't say. The entry still owns
 * the ids of the rules it made, though: replacing or removing the entry takes out whatever rule is registered under
 * them by then, the plugin's included, so the last change made wins. (A plugin's replacement with no id can't be found
 * that way, and stays.)
 *
 * Every change is checked in full before anything is touched, so one that is refused leaves the registry, and the
 * game's rules, as they were.
 */
export class RequirementRegistry extends EntityRegistry<Requirement> {
  private _byId: Map<string, Requirement> = new Map();
  // Each entry under its subject, for `for`: play asks it (whether a Wonder is obsolete), so it is a lookup rather than
  //  a scan of every entry. Each bucket is in registration order.
  private _bySubject = this.index((entry: Requirement) => entry.subject);
  private _derived: Map<Requirement, Rule[]> = new Map();
  private _derivers: Map<Requirement, Deriver | null> = new Map();
  // When each entry was added, to put the buckets of a subject and its superclasses back in registration order.
  private _added: Map<Requirement, number> = new Map();
  private _nextAdded: number = 0;
  private _rules: RuleRegistry;

  constructor(rules: RuleRegistry = ruleRegistryInstance) {
    super(Requirement);

    this._rules = rules;
  }

  /**
   * Holds `entries` and registers the rules `derive` makes from each, in order. `derive` is `null` for an entry whose
   * rule is written by hand (a state condition), which the entry only describes. An entry may be given as a plain
   * object, and is held as a `Requirement`.
   */
  add(
    derive: Deriver | null,
    ...entries: (Requirement | IRequirement)[]
  ): void {
    const prepared = this.prepare(derive, entries, []);

    this.commit(derive, prepared);
  }

  /** As `add`, with no rules made: the entries only describe. */
  register(...entries: Requirement[]): void {
    this.add(null, ...entries);
  }

  /** The entry registered as `id`, or `null`. */
  getById(id: string): Requirement | null {
    return this._byId.get(id) ?? null;
  }

  /**
   * The entries about `Subject`, or a class it extends, optionally only those of one relation, in the order they were
   * added.
   */
  for(Subject: IConstructor, relation?: Relation): Requirement[] {
    const found: Requirement[] = [];

    for (
      let Class: unknown = Subject;
      typeof Class === 'function';
      Class = Object.getPrototypeOf(Class)
    ) {
      this._bySubject
        .get(Class as IConstructor)
        .forEach((entry: Requirement): void => {
          if (relation === undefined || entry.relation === relation) {
            found.push(entry);
          }
        });
    }

    return found.length > 1
      ? found.sort(
          (a: Requirement, b: Requirement): number =>
            this._added.get(a)! - this._added.get(b)!
        )
      : found;
  }

  /** The entries that name `target`: what an advance leads to, what a Wonder makes obsolete. */
  leadsTo(target: Target, relation?: Relation): Requirement[] {
    return this.filter(
      (entry: Requirement): boolean =>
        (relation === undefined || entry.relation === relation) &&
        entry.targets.some((candidate: Target): boolean =>
          target instanceof Condition
            ? candidate instanceof Condition && candidate.id === target.id
            : candidate === target
        )
    );
  }

  /**
   * Swaps the entry registered as `id` for `entries`, and its rules for the ones the same deriver makes from them. The
   * replacements needn't keep the id. Throws for an id nothing is registered as, as a mistyped plugin should.
   */
  replace(id: string, ...entries: (Requirement | IRequirement)[]): void {
    const existing = this.require(id),
      derive = this._derivers.get(existing) ?? null,
      prepared = this.prepare(derive, entries, [existing]);

    this.drop(existing);
    this.commit(derive, prepared);
  }

  /** Drops the entry registered as `id` and the rules made from it. Throws for an id nothing is registered as. */
  remove(id: string): void {
    this.drop(this.require(id));
  }

  /** As `remove`, for those of `entries` it holds: like any registry, it ignores the others. */
  unregister(...entries: Requirement[]): void {
    entries
      .filter((entry: Requirement): boolean => this._derivers.has(entry))
      .forEach((entry: Requirement): void => this.drop(entry));
  }

  /** The rules made from the entry registered as `id`: none for one that only describes. */
  rulesFor(id: string): Rule[] {
    return [...(this._derived.get(this.require(id)) ?? [])];
  }

  /** The rule registry the entries' rules go into: a game's own. */
  ruleRegistry(): RuleRegistry {
    return this._rules;
  }

  // Held and registered, once `prepare` has checked them.
  private commit(
    derive: Deriver | null,
    prepared: [Requirement, Rule[]][]
  ): void {
    prepared.forEach(([entry, rules]): void => {
      this._byId.set(entry.id, entry);
      this._added.set(entry, this._nextAdded++);
      this._derivers.set(entry, derive);
      this._derived.set(entry, rules);
    });

    super.register(...prepared.map(([entry]) => entry));

    // In one call, so the rules land in the order the entries were given, as a spread of them into `rules.register`
    //  always did.
    this._rules.register(...prepared.flatMap(([, rules]) => rules));
  }

  // Taken out with its rules: the ones it made, and whatever is registered under their ids by now.
  private drop(entry: Requirement): void {
    const ruleIds = (this._derived.get(entry) ?? [])
        .map((rule: Rule): string | null => rule.id())
        .filter((id: string | null): id is string => id !== null),
      rules = [
        ...(this._derived.get(entry) ?? []),
        ...ruleIds.map((id: string): Rule | null => this._rules.getById(id)),
      ].filter(
        (
          rule: Rule | null,
          index: number,
          all: (Rule | null)[]
        ): rule is Rule =>
          rule !== null &&
          this._rules.includes(rule) &&
          all.indexOf(rule) === index
      );

    this._rules.unregister(...rules);

    super.unregister(entry);

    this._byId.delete(entry.id);
    this._derivers.delete(entry);
    this._derived.delete(entry);
    this._added.delete(entry);
  }

  // `entries` as `Requirement`s, each with the rules `derive` makes from it, once nothing about them would be refused:
  //  an id held by another entry (other than those being replaced) or given twice, or a rule id already taken by a
  //  rule that isn't the replaced entries'.
  private prepare(
    derive: Deriver | null,
    entries: (Requirement | IRequirement)[],
    replacing: Requirement[]
  ): [Requirement, Rule[]][] {
    const requirements = entries.map(
        (entry: Requirement | IRequirement): Requirement =>
          entry instanceof Requirement ? entry : new Requirement(entry)
      ),
      freedEntryIds = replacing.map((entry: Requirement): string => entry.id),
      freedRuleIds = replacing.flatMap(
        (entry: Requirement): (string | null)[] =>
          (this._derived.get(entry) ?? []).map((rule: Rule) => rule.id())
      ),
      seenEntryIds = new Set<string>(),
      seenRuleIds = new Set<string>();

    return requirements.map((entry: Requirement): [Requirement, Rule[]] => {
      if (
        seenEntryIds.has(entry.id) ||
        (this._byId.has(entry.id) && !freedEntryIds.includes(entry.id))
      ) {
        // As `RuleRegistry`: two entries under one id would make `replace` and `remove` ambiguous.
        throw new DuplicateRequirementIdError(
          `Two requirements claim the id '${entry.id}'. Ids address a single requirement, so one of them could ` +
            'never be replaced or removed.'
        );
      }

      seenEntryIds.add(entry.id);

      const rules = derive === null ? [] : derive(entry, this);

      rules.forEach((rule: Rule): void => {
        const ruleId = rule.id();

        if (ruleId === null) {
          return;
        }

        if (
          seenRuleIds.has(ruleId) ||
          (this._rules.getById(ruleId) !== null &&
            !freedRuleIds.includes(ruleId))
        ) {
          throw new DuplicateRuleIdError(
            `The rules made from '${entry.id}' claim the id '${ruleId}', which another rule already has.`
          );
        }

        seenRuleIds.add(ruleId);
      });

      return [entry, rules];
    });
  }

  private require(id: string): Requirement {
    const entry = this._byId.get(id);

    if (!entry) {
      throw new UnknownRequirementError(
        `No requirement is registered as '${id}'. Either it is misspelled, or the package that declares it is not ` +
          'loaded, or its id changed.'
      );
    }

    return entry;
  }
}

export const instance: RequirementRegistry = new RequirementRegistry();

export default RequirementRegistry;
