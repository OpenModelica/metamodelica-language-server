function foo "Function with problems"
  input Boolean inKey;
  output Boolean res;
algorithm
  res := match (inKey)
    case (true) equation
      true = intEq(1, 1);
    then true;
    else false;
  end match;
end foo;
