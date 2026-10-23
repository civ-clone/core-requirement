"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instance = exports.RequirementRegistry = exports.DuplicateRequirementIdError = exports.UnknownRequirementError = void 0;
const Requirement_1 = require("./Requirement");
const RuleRegistry_1 = require("@civ-clone/core-rule/RuleRegistry");
const EntityRegistry_1 = require("@civ-clone/core-registry/EntityRegistry");
class UnknownRequirementError extends Error {
}
exports.UnknownRequirementError = UnknownRequirementError;
class DuplicateRequirementIdError extends Error {
}
exports.DuplicateRequirementIdError = DuplicateRequirementIdError;
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
class RequirementRegistry extends EntityRegistry_1.EntityRegistry {
    constructor(rules = RuleRegistry_1.instance) {
        super(Requirement_1.Requirement);
        this._byId = new Map();
        // Each entry under its subject, for `for`: play asks it (whether a Wonder is obsolete), so it is a lookup rather than
        //  a scan of every entry. Each bucket is in registration order.
        this._bySubject = this.index((entry) => entry.subject);
        this._derived = new Map();
        this._derivers = new Map();
        // When each entry was added, to put the buckets of a subject and its superclasses back in registration order.
        this._added = new Map();
        this._nextAdded = 0;
        this._rules = rules;
    }
    /**
     * Holds `entries` and registers the rules `derive` makes from each, in order. `derive` is `null` for an entry whose
     * rule is written by hand (a state condition), which the entry only describes. An entry may be given as a plain
     * object, and is held as a `Requirement`.
     */
    add(derive, ...entries) {
        const prepared = this.prepare(derive, entries, []);
        this.commit(derive, prepared);
    }
    /** As `add`, with no rules made: the entries only describe. */
    register(...entries) {
        this.add(null, ...entries);
    }
    /** The entry registered as `id`, or `null`. */
    getById(id) {
        var _a;
        return (_a = this._byId.get(id)) !== null && _a !== void 0 ? _a : null;
    }
    /**
     * The entries about `Subject`, or a class it extends, optionally only those of one relation, in the order they were
     * added.
     */
    for(Subject, relation) {
        const found = [];
        for (let Class = Subject; typeof Class === 'function'; Class = Object.getPrototypeOf(Class)) {
            this._bySubject
                .get(Class)
                .forEach((entry) => {
                if (relation === undefined || entry.relation === relation) {
                    found.push(entry);
                }
            });
        }
        return found.length > 1
            ? found.sort((a, b) => this._added.get(a) - this._added.get(b))
            : found;
    }
    /** The entries that name `target`: what an advance leads to, what a Wonder makes obsolete. */
    leadsTo(target, relation) {
        return this.filter((entry) => (relation === undefined || entry.relation === relation) &&
            entry.targets.some((candidate) => target instanceof Requirement_1.Condition
                ? candidate instanceof Requirement_1.Condition && candidate.id === target.id
                : candidate === target));
    }
    /**
     * Swaps the entry registered as `id` for `entries`, and its rules for the ones the same deriver makes from them. The
     * replacements needn't keep the id. Throws for an id nothing is registered as, as a mistyped plugin should.
     */
    replace(id, ...entries) {
        var _a;
        const existing = this.require(id), derive = (_a = this._derivers.get(existing)) !== null && _a !== void 0 ? _a : null, prepared = this.prepare(derive, entries, [existing]);
        this.drop(existing);
        this.commit(derive, prepared);
    }
    /** Drops the entry registered as `id` and the rules made from it. Throws for an id nothing is registered as. */
    remove(id) {
        this.drop(this.require(id));
    }
    /** As `remove`, for those of `entries` it holds: like any registry, it ignores the others. */
    unregister(...entries) {
        entries
            .filter((entry) => this._derivers.has(entry))
            .forEach((entry) => this.drop(entry));
    }
    /** The rules made from the entry registered as `id`: none for one that only describes. */
    rulesFor(id) {
        var _a;
        return [...((_a = this._derived.get(this.require(id))) !== null && _a !== void 0 ? _a : [])];
    }
    /** The rule registry the entries' rules go into: a game's own. */
    ruleRegistry() {
        return this._rules;
    }
    // Held and registered, once `prepare` has checked them.
    commit(derive, prepared) {
        prepared.forEach(([entry, rules]) => {
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
    drop(entry) {
        var _a, _b;
        const ruleIds = ((_a = this._derived.get(entry)) !== null && _a !== void 0 ? _a : [])
            .map((rule) => rule.id())
            .filter((id) => id !== null), rules = [
            ...((_b = this._derived.get(entry)) !== null && _b !== void 0 ? _b : []),
            ...ruleIds.map((id) => this._rules.getById(id)),
        ].filter((rule, index, all) => rule !== null &&
            this._rules.includes(rule) &&
            all.indexOf(rule) === index);
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
    prepare(derive, entries, replacing) {
        const requirements = entries.map((entry) => entry instanceof Requirement_1.Requirement ? entry : new Requirement_1.Requirement(entry)), freedEntryIds = replacing.map((entry) => entry.id), freedRuleIds = replacing.flatMap((entry) => { var _a; return ((_a = this._derived.get(entry)) !== null && _a !== void 0 ? _a : []).map((rule) => rule.id()); }), seenEntryIds = new Set(), seenRuleIds = new Set();
        return requirements.map((entry) => {
            if (seenEntryIds.has(entry.id) ||
                (this._byId.has(entry.id) && !freedEntryIds.includes(entry.id))) {
                // As `RuleRegistry`: two entries under one id would make `replace` and `remove` ambiguous.
                throw new DuplicateRequirementIdError(`Two requirements claim the id '${entry.id}'. Ids address a single requirement, so one of them could ` +
                    'never be replaced or removed.');
            }
            seenEntryIds.add(entry.id);
            const rules = derive === null ? [] : derive(entry, this);
            rules.forEach((rule) => {
                const ruleId = rule.id();
                if (ruleId === null) {
                    return;
                }
                if (seenRuleIds.has(ruleId) ||
                    (this._rules.getById(ruleId) !== null &&
                        !freedRuleIds.includes(ruleId))) {
                    throw new RuleRegistry_1.DuplicateRuleIdError(`The rules made from '${entry.id}' claim the id '${ruleId}', which another rule already has.`);
                }
                seenRuleIds.add(ruleId);
            });
            return [entry, rules];
        });
    }
    require(id) {
        const entry = this._byId.get(id);
        if (!entry) {
            throw new UnknownRequirementError(`No requirement is registered as '${id}'. Either it is misspelled, or the package that declares it is not ` +
                'loaded, or its id changed.');
        }
        return entry;
    }
}
exports.RequirementRegistry = RequirementRegistry;
exports.instance = new RequirementRegistry();
exports.default = RequirementRegistry;
//# sourceMappingURL=RequirementRegistry.js.map