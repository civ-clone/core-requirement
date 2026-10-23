import { Condition, Relation, Requirement, Target } from './Requirement';
import {
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
 * another. `rules.replace` on a derived rule still works, as the way out for behaviour the graph can't say.
 */
export class RequirementRegistry extends EntityRegistry<Requirement> {
  private _byId: Map<string, Requirement> = new Map();
  private _derived: Map<Requirement, Rule[]> = new Map();
  private _derivers: Map<Requirement, Deriver | null> = new Map();
  private _rules: RuleRegistry;

  constructor(rules: RuleRegistry = ruleRegistryInstance) {
    super(Requirement);

    this._rules = rules;
  }

  /**
   * Holds `entries` and registers the rules `derive` makes from each, in order. `derive` is `null` for an entry whose
   * rule is written by hand (a state condition), which the entry only describes.
   */
  add(derive: Deriver | null, ...entries: Requirement[]): void {
    this.refuseDuplicates(entries);

    super.register(...entries);

    const rules = entries.flatMap((entry: Requirement): Rule[] =>
      this.derive(entry, derive)
    );

    // In one call, so the rules land in the order the entries were given, as a spread of them into
    //  `rules.register` always did.
    this._rules.register(...rules);
  }

  /** As `add`, with no rules made: the entries only describe. */
  register(...entries: Requirement[]): void {
    this.add(null, ...entries);
  }

  /** The entry registered as `id`, or `null`. */
  getById(id: string): Requirement | null {
    return this._byId.get(id) ?? null;
  }

  /** The entries about `Subject`, or a class it extends, optionally only those of one relation. */
  for(Subject: IConstructor, relation?: Relation): Requirement[] {
    return this.filter(
      (entry: Requirement): boolean =>
        (relation === undefined || entry.relation === relation) &&
        (entry.subject === Subject ||
          Object.prototype.isPrototypeOf.call(entry.subject, Subject))
    );
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
  replace(id: string, ...entries: Requirement[]): void {
    const existing = this.require(id),
      derive = this._derivers.get(existing) ?? null;

    this.refuseDuplicates(
      entries.filter((entry: Requirement): boolean => entry.id !== id)
    );

    this.drop(existing);

    super.register(...entries);

    this._rules.register(
      ...entries.flatMap((entry: Requirement): Rule[] =>
        this.derive(entry, derive)
      )
    );
  }

  /** Drops the entry registered as `id` and the rules made from it. Throws for an id nothing is registered as. */
  remove(id: string): void {
    this.drop(this.require(id));
  }

  /** As `remove`, for each of `entries`. */
  unregister(...entries: Requirement[]): void {
    entries.forEach((entry: Requirement): void => this.remove(entry.id));
  }

  /** The rules made from the entry registered as `id`: none for one that only describes. */
  rulesFor(id: string): Rule[] {
    return [...(this._derived.get(this.require(id)) ?? [])];
  }

  private derive(entry: Requirement, derive: Deriver | null): Rule[] {
    const rules = derive === null ? [] : derive(entry, this);

    this._byId.set(entry.id, entry);
    this._derivers.set(entry, derive);
    this._derived.set(entry, rules);

    return rules;
  }

  private drop(entry: Requirement): void {
    const rules = (this._derived.get(entry) ?? []).filter((rule: Rule) =>
      this._rules.includes(rule)
    );

    this._rules.unregister(...rules);

    super.unregister(entry);

    this._byId.delete(entry.id);
    this._derivers.delete(entry);
    this._derived.delete(entry);
  }

  private refuseDuplicates(entries: Requirement[]): void {
    const seen = new Set<string>();

    entries.forEach((entry: Requirement): void => {
      if (this._byId.has(entry.id) || seen.has(entry.id)) {
        // As `RuleRegistry`: two entries under one id would make `replace` and `remove` ambiguous.
        throw new DuplicateRequirementIdError(
          `Two requirements claim the id '${entry.id}'. Ids address a single requirement, so one of them could ` +
            'never be replaced or removed.'
        );
      }

      seen.add(entry.id);
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
