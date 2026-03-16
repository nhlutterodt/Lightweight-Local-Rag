module.exports = {
  rules: {
    "declaration-property-value-disallowed-list": {
      "/^(color|background|background-color|border-color|border-left-color)$/": [
        "/#10b981|#ef4444|#f59e0b|#b91c1c|#047857|#b45309/i"
      ],
      "/^z-index$/": ["1000"],
      "/^border-radius$/": ["9999px"],
      "/^width$/": ["320px"]
    }
  }
};
