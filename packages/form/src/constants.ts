/** Stands for any list index in a path that names fields of every item, such as `` `jobs.${FORM_INDEX}.title` ``. */
export const FORM_INDEX = "__SOLIX_FORM_INDEX__";

/** Keys, in a rules record, the rule that validates the object or list itself. */
export const formRootRule = Symbol("root-rule");
