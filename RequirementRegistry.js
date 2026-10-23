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
 * another. `rules.replace` on a derived rule still works, as the way out for behaviour the graph can't say.
 */
class RequirementRegistry extends EntityRegistry_1.EntityRegistry {
    constructor(rules = RuleRegistry_1.instance) {
        super(Requirement_1.Requirement);
        this._byId = new Map();
        this._derived = new Map();
        this._derivers = new Map();
        this._rules = rules;
    }
    /**
     * Holds `entries` and registers the rules `derive` makes from each, in order. `derive` is `null` for an entry whose
     * rule is written by hand (a state condition), which the entry only describes.
     */
    add(derive, ...entries) {
        this.refuseDuplicates(entries);
        super.register(...entries);
        const rules = entries.flatMap((entry) => this.derive(entry, derive));
        // In one call, so the rules land in the order the entries were given, as a spread of them into
        //  `rules.register` always did.
        this._rules.register(...rules);
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
    /** The entries about `Subject`, or a class it extends, optionally only those of one relation. */
    for(Subject, relation) {
        return this.filter((entry) => (relation === undefined || entry.relation === relation) &&
            (entry.subject === Subject ||
                Object.prototype.isPrototypeOf.call(entry.subject, Subject)));
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
        const existing = this.require(id), derive = (_a = this._derivers.get(existing)) !== null && _a !== void 0 ? _a : null;
        this.refuseDuplicates(entries.filter((entry) => entry.id !== id));
        this.drop(existing);
        super.register(...entries);
        this._rules.register(...entries.flatMap((entry) => this.derive(entry, derive)));
    }
    /** Drops the entry registered as `id` and the rules made from it. Throws for an id nothing is registered as. */
    remove(id) {
        this.drop(this.require(id));
    }
    /** As `remove`, for each of `entries`. */
    unregister(...entries) {
        entries.forEach((entry) => this.remove(entry.id));
    }
    /** The rules made from the entry registered as `id`: none for one that only describes. */
    rulesFor(id) {
        var _a;
        return [...((_a = this._derived.get(this.require(id))) !== null && _a !== void 0 ? _a : [])];
    }
    derive(entry, derive) {
        const rules = derive === null ? [] : derive(entry, this);
        this._byId.set(entry.id, entry);
        this._derivers.set(entry, derive);
        this._derived.set(entry, rules);
        return rules;
    }
    drop(entry) {
        var _a;
        const rules = ((_a = this._derived.get(entry)) !== null && _a !== void 0 ? _a : []).filter((rule) => this._rules.includes(rule));
        this._rules.unregister(...rules);
        super.unregister(entry);
        this._byId.delete(entry.id);
        this._derivers.delete(entry);
        this._derived.delete(entry);
    }
    refuseDuplicates(entries) {
        const seen = new Set();
        entries.forEach((entry) => {
            if (this._byId.has(entry.id) || seen.has(entry.id)) {
                // As `RuleRegistry`: two entries under one id would make `replace` and `remove` ambiguous.
                throw new DuplicateRequirementIdError(`Two requirements claim the id '${entry.id}'. Ids address a single requirement, so one of them could ` +
                    'never be replaced or removed.');
            }
            seen.add(entry.id);
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