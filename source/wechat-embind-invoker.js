// Inserted into the occt.ts glue at build time. This implements the same
// argument conversion and cleanup without compiling JavaScript from strings,
// which mini-program environments do not allow.
function craftInvokerFunction(humanName, argTypes, classType, cppInvokerFunc, cppTargetFunc, isAsync) {
  if (argTypes.length < 2) {
    throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!");
  }
  const isClassMethod = argTypes[1] !== null && classType !== null;
  const needsDestructorStack = usesDestructorStack(argTypes);
  const returnsValue = argTypes[0].name !== 'void';
  const invoker = function (...args) {
    const destructors = needsDestructorStack ? [] : null;
    const wiredByType = [];
    const wiredArgs = [cppTargetFunc];
    if (isClassMethod) {
      wiredByType[1] = argTypes[1].toWireType(destructors, this);
      wiredArgs.push(wiredByType[1]);
    }
    for (let i = 2; i < argTypes.length; i++) {
      wiredByType[i] = argTypes[i].toWireType(destructors, args[i - 2]);
      wiredArgs.push(wiredByType[i]);
    }
    const result = cppInvokerFunc(...wiredArgs);
    if (needsDestructorStack) {
      runDestructors(destructors);
    } else {
      for (let i = isClassMethod ? 1 : 2; i < argTypes.length; i++) {
        if (argTypes[i].destructorFunction !== null) {
          const destructor = argTypes[i].destructorFunction;
          destructor(wiredByType[i]);
        }
      }
    }
    if (returnsValue) return argTypes[0].fromWireType(result);
  };
  return createNamedFunction(humanName, invoker);
}
