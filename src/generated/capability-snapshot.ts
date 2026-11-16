// Generated from the Lumen Charts capability catalog. Do not edit.
import type { ChartCapability } from '../capabilities.js';

export const CHART_CAPABILITY_SCHEMA_HASH = '9e66c643c81832ed20297ac6255db8697a97334d24a54da8d028acb12f518341';
export const CHART_CAPABILITIES = [
  {
    "kind": "drawing",
    "id": "horizontal_line",
    "title": "Horizontal Line",
    "anchors": {
      "min": 1,
      "max": 1,
      "roles": [
        "price"
      ]
    },
    "fields": [
      {
        "id": "color",
        "title": "Color",
        "kind": "color",
        "writable": true,
        "default": "#2962ff"
      },
      {
        "id": "lineWidth",
        "title": "Line width",
        "kind": "integer",
        "writable": true,
        "min": 1,
        "max": 8,
        "unit": "px",
        "default": 2
      },
      {
        "id": "lineStyle",
        "title": "Line style",
        "kind": "enum",
        "writable": true,
        "choices": [
          "solid",
          "dashed",
          "dotted"
        ],
        "default": "solid"
      },
      {
        "id": "visible",
        "title": "Visible",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "title",
        "title": "Title",
        "kind": "text",
        "writable": true,
        "maxLength": 100
      },
      {
        "id": "price.show",
        "title": "Show price label",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "text",
        "title": "Text",
        "kind": "text",
        "writable": true,
        "default": ""
      },
      {
        "id": "label.show",
        "title": "Show label",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.color",
        "title": "Label color",
        "kind": "color",
        "writable": true,
        "default": "#2962ff"
      },
      {
        "id": "label.fontSize",
        "title": "Label font size",
        "kind": "integer",
        "writable": true,
        "min": 8,
        "max": 48,
        "unit": "px",
        "default": 12
      },
      {
        "id": "label.bold",
        "title": "Label bold",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.italic",
        "title": "Label italic",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.horizontalAlign",
        "title": "Label horizontal alignment",
        "kind": "enum",
        "writable": true,
        "choices": [
          "left",
          "center",
          "right"
        ],
        "default": "center"
      },
      {
        "id": "label.verticalAlign",
        "title": "Label vertical alignment",
        "kind": "enum",
        "writable": true,
        "choices": [
          "top",
          "middle",
          "bottom"
        ],
        "default": "top"
      }
    ],
    "operations": [
      "create",
      "update",
      "delete",
      "group"
    ],
    "targets": [
      "main-series"
    ]
  },
  {
    "kind": "drawing",
    "id": "vertical_line",
    "title": "Vertical Line",
    "anchors": {
      "min": 1,
      "max": 1,
      "roles": [
        "time"
      ]
    },
    "fields": [
      {
        "id": "color",
        "title": "Color",
        "kind": "color",
        "writable": true,
        "default": "#2962ff"
      },
      {
        "id": "lineWidth",
        "title": "Line width",
        "kind": "integer",
        "writable": true,
        "min": 1,
        "max": 8,
        "unit": "px",
        "default": 2
      },
      {
        "id": "lineStyle",
        "title": "Line style",
        "kind": "enum",
        "writable": true,
        "choices": [
          "solid",
          "dashed",
          "dotted"
        ],
        "default": "solid"
      },
      {
        "id": "visible",
        "title": "Visible",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "title",
        "title": "Title",
        "kind": "text",
        "writable": true,
        "maxLength": 100
      },
      {
        "id": "extend.line",
        "title": "Extend vertically",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "time.show",
        "title": "Show time label",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "text",
        "title": "Text",
        "kind": "text",
        "writable": true,
        "default": ""
      },
      {
        "id": "label.show",
        "title": "Show label",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.color",
        "title": "Label color",
        "kind": "color",
        "writable": true,
        "default": "#2962ff"
      },
      {
        "id": "label.fontSize",
        "title": "Label font size",
        "kind": "integer",
        "writable": true,
        "min": 8,
        "max": 48,
        "unit": "px",
        "default": 14
      },
      {
        "id": "label.bold",
        "title": "Label bold",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.italic",
        "title": "Label italic",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.horizontalAlign",
        "title": "Label horizontal alignment",
        "kind": "enum",
        "writable": true,
        "choices": [
          "left",
          "center",
          "right"
        ],
        "default": "right"
      },
      {
        "id": "label.verticalAlign",
        "title": "Label vertical alignment",
        "kind": "enum",
        "writable": true,
        "choices": [
          "top",
          "middle",
          "bottom"
        ],
        "default": "top"
      },
      {
        "id": "label.orientation",
        "title": "Label orientation",
        "kind": "enum",
        "writable": true,
        "choices": [
          "horizontal",
          "vertical"
        ],
        "default": "vertical"
      }
    ],
    "operations": [
      "create",
      "update",
      "delete",
      "group"
    ],
    "targets": [
      "main-series"
    ]
  },
  {
    "kind": "drawing",
    "id": "trend_line",
    "title": "Trend Line",
    "anchors": {
      "min": 2,
      "max": 2,
      "roles": [
        "time_price",
        "time_price"
      ]
    },
    "fields": [
      {
        "id": "color",
        "title": "Color",
        "kind": "color",
        "writable": true,
        "default": "#2962ff"
      },
      {
        "id": "lineWidth",
        "title": "Line width",
        "kind": "integer",
        "writable": true,
        "min": 1,
        "max": 8,
        "unit": "px",
        "default": 2
      },
      {
        "id": "lineStyle",
        "title": "Line style",
        "kind": "enum",
        "writable": true,
        "choices": [
          "solid",
          "dashed",
          "dotted"
        ],
        "default": "solid"
      },
      {
        "id": "text",
        "title": "Text",
        "kind": "text",
        "writable": true,
        "default": ""
      },
      {
        "id": "visible",
        "title": "Visible",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "title",
        "title": "Title",
        "kind": "text",
        "writable": true,
        "maxLength": 100
      },
      {
        "id": "extend.left",
        "title": "Extend left",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "extend.right",
        "title": "Extend right",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "end.left",
        "title": "Left end",
        "kind": "enum",
        "writable": true,
        "choices": [
          "normal",
          "arrow"
        ],
        "default": "normal"
      },
      {
        "id": "end.right",
        "title": "Right end",
        "kind": "enum",
        "writable": true,
        "choices": [
          "normal",
          "arrow"
        ],
        "default": "normal"
      },
      {
        "id": "middlePoint.show",
        "title": "Show middle point",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "priceLabels.show",
        "title": "Show price labels",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "stats.priceRange",
        "title": "Show price range",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "stats.percentChange",
        "title": "Show percent change",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "stats.bars",
        "title": "Show bars range",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "stats.dateTime",
        "title": "Show date and time range",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "stats.distance",
        "title": "Show distance",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "stats.angle",
        "title": "Show angle",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.show",
        "title": "Show label",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.color",
        "title": "Label color",
        "kind": "color",
        "writable": true,
        "default": "#2962ff"
      },
      {
        "id": "label.fontSize",
        "title": "Label font size",
        "kind": "integer",
        "writable": true,
        "min": 8,
        "max": 48,
        "unit": "px",
        "default": 14
      },
      {
        "id": "label.bold",
        "title": "Label bold",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.italic",
        "title": "Label italic",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.horizontalAlign",
        "title": "Label horizontal alignment",
        "kind": "enum",
        "writable": true,
        "choices": [
          "left",
          "center",
          "right"
        ],
        "default": "center"
      },
      {
        "id": "label.verticalAlign",
        "title": "Label vertical alignment",
        "kind": "enum",
        "writable": true,
        "choices": [
          "top",
          "middle",
          "bottom"
        ],
        "default": "bottom"
      }
    ],
    "operations": [
      "create",
      "update",
      "delete",
      "group"
    ],
    "targets": [
      "main-series"
    ]
  },
  {
    "kind": "drawing",
    "id": "ray",
    "title": "Ray",
    "anchors": {
      "min": 2,
      "max": 2,
      "roles": [
        "time_price",
        "time_price"
      ]
    },
    "fields": [
      {
        "id": "color",
        "title": "Color",
        "kind": "color",
        "writable": true,
        "default": "#2962ff"
      },
      {
        "id": "lineWidth",
        "title": "Line width",
        "kind": "integer",
        "writable": true,
        "min": 1,
        "max": 8,
        "unit": "px",
        "default": 2
      },
      {
        "id": "lineStyle",
        "title": "Line style",
        "kind": "enum",
        "writable": true,
        "choices": [
          "solid",
          "dashed",
          "dotted"
        ],
        "default": "solid"
      },
      {
        "id": "visible",
        "title": "Visible",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "title",
        "title": "Title",
        "kind": "text",
        "writable": true,
        "maxLength": 100
      },
      {
        "id": "extend.left",
        "title": "Extend left",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "extend.right",
        "title": "Extend right",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "end.left",
        "title": "Left end",
        "kind": "enum",
        "writable": true,
        "choices": [
          "normal",
          "arrow"
        ],
        "default": "normal"
      },
      {
        "id": "end.right",
        "title": "Right end",
        "kind": "enum",
        "writable": true,
        "choices": [
          "normal",
          "arrow"
        ],
        "default": "normal"
      },
      {
        "id": "middlePoint.show",
        "title": "Show middle point",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "priceLabels.show",
        "title": "Show price labels",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "stats.priceRange",
        "title": "Show price range",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "stats.percentChange",
        "title": "Show percent change",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "stats.bars",
        "title": "Show bars range",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "stats.dateTime",
        "title": "Show date and time range",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "stats.distance",
        "title": "Show distance",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "stats.angle",
        "title": "Show angle",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "text",
        "title": "Text",
        "kind": "text",
        "writable": true,
        "default": ""
      },
      {
        "id": "label.show",
        "title": "Show label",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.color",
        "title": "Label color",
        "kind": "color",
        "writable": true,
        "default": "#2962ff"
      },
      {
        "id": "label.fontSize",
        "title": "Label font size",
        "kind": "integer",
        "writable": true,
        "min": 8,
        "max": 48,
        "unit": "px",
        "default": 14
      },
      {
        "id": "label.bold",
        "title": "Label bold",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.italic",
        "title": "Label italic",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.horizontalAlign",
        "title": "Label horizontal alignment",
        "kind": "enum",
        "writable": true,
        "choices": [
          "left",
          "center",
          "right"
        ],
        "default": "center"
      },
      {
        "id": "label.verticalAlign",
        "title": "Label vertical alignment",
        "kind": "enum",
        "writable": true,
        "choices": [
          "top",
          "middle",
          "bottom"
        ],
        "default": "bottom"
      }
    ],
    "operations": [
      "create",
      "update",
      "delete",
      "group"
    ],
    "targets": [
      "main-series"
    ]
  },
  {
    "kind": "drawing",
    "id": "rectangle",
    "title": "Rectangle",
    "anchors": {
      "min": 2,
      "max": 2,
      "roles": [
        "time_price",
        "time_price"
      ]
    },
    "fields": [
      {
        "id": "color",
        "title": "Color",
        "kind": "color",
        "writable": true,
        "default": "#9c27b0"
      },
      {
        "id": "lineWidth",
        "title": "Line width",
        "kind": "integer",
        "writable": true,
        "min": 1,
        "max": 8,
        "unit": "px",
        "default": 2
      },
      {
        "id": "lineStyle",
        "title": "Line style",
        "kind": "enum",
        "writable": true,
        "choices": [
          "solid",
          "dashed",
          "dotted"
        ],
        "default": "solid"
      },
      {
        "id": "fillOpacity",
        "title": "Fill opacity",
        "kind": "number",
        "writable": true,
        "min": 0,
        "max": 1,
        "default": 0.2
      },
      {
        "id": "text",
        "title": "Text",
        "kind": "text",
        "writable": true,
        "default": ""
      },
      {
        "id": "visible",
        "title": "Visible",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "title",
        "title": "Title",
        "kind": "text",
        "writable": true,
        "maxLength": 100
      },
      {
        "id": "fill.visible",
        "title": "Show fill",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "fill.color",
        "title": "Fill color",
        "kind": "color",
        "writable": true,
        "default": "#9c27b0"
      },
      {
        "id": "midline.show",
        "title": "Show middle line",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "midline.color",
        "title": "Middle line color",
        "kind": "color",
        "writable": true,
        "default": "#9c27b0"
      },
      {
        "id": "midline.width",
        "title": "Middle line width",
        "kind": "integer",
        "writable": true,
        "min": 1,
        "max": 8,
        "unit": "px",
        "default": 1
      },
      {
        "id": "midline.style",
        "title": "Middle line style",
        "kind": "enum",
        "writable": true,
        "choices": [
          "solid",
          "dashed",
          "dotted"
        ],
        "default": "dashed"
      },
      {
        "id": "extend.left",
        "title": "Extend left",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "extend.right",
        "title": "Extend right",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.show",
        "title": "Show label",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.color",
        "title": "Label color",
        "kind": "color",
        "writable": true,
        "default": "#9c27b0"
      },
      {
        "id": "label.fontSize",
        "title": "Label font size",
        "kind": "integer",
        "writable": true,
        "min": 8,
        "max": 48,
        "unit": "px",
        "default": 14
      },
      {
        "id": "label.bold",
        "title": "Label bold",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.italic",
        "title": "Label italic",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.horizontalAlign",
        "title": "Label horizontal alignment",
        "kind": "enum",
        "writable": true,
        "choices": [
          "left",
          "center",
          "right"
        ],
        "default": "left"
      },
      {
        "id": "label.verticalAlign",
        "title": "Label vertical alignment",
        "kind": "enum",
        "writable": true,
        "choices": [
          "top",
          "middle",
          "bottom"
        ],
        "default": "bottom"
      }
    ],
    "operations": [
      "create",
      "update",
      "delete",
      "group"
    ],
    "targets": [
      "main-series"
    ]
  },
  {
    "kind": "drawing",
    "id": "text",
    "title": "Text",
    "anchors": {
      "min": 1,
      "max": 1,
      "roles": [
        "time_price"
      ]
    },
    "fields": [
      {
        "id": "color",
        "title": "Color",
        "kind": "color",
        "writable": true,
        "default": "#2962ff"
      },
      {
        "id": "text",
        "title": "Text",
        "kind": "text",
        "writable": true,
        "default": "Text"
      },
      {
        "id": "visible",
        "title": "Visible",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "title",
        "title": "Title",
        "kind": "text",
        "writable": true,
        "maxLength": 100
      },
      {
        "id": "label.fontSize",
        "title": "Label font size",
        "kind": "integer",
        "writable": true,
        "min": 8,
        "max": 48,
        "unit": "px",
        "default": 14
      },
      {
        "id": "label.bold",
        "title": "Label bold",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.italic",
        "title": "Label italic",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "fill.visible",
        "title": "Show fill",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "fill.color",
        "title": "Fill color",
        "kind": "color",
        "writable": true,
        "default": "#5b85bf4d"
      },
      {
        "id": "border.show",
        "title": "Show border",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "border.color",
        "title": "Border color",
        "kind": "color",
        "writable": true,
        "default": "#667b8b"
      }
    ],
    "operations": [
      "create",
      "update",
      "delete",
      "group"
    ],
    "targets": [
      "main-series"
    ]
  },
  {
    "kind": "drawing",
    "id": "fib_retracement",
    "title": "Fib Retracement",
    "anchors": {
      "min": 2,
      "max": 2,
      "roles": [
        "time_price",
        "time_price"
      ]
    },
    "fields": [
      {
        "id": "color",
        "title": "Color",
        "kind": "color",
        "writable": true,
        "default": "#787b86"
      },
      {
        "id": "lineWidth",
        "title": "Line width",
        "kind": "integer",
        "writable": true,
        "min": 1,
        "max": 8,
        "unit": "px",
        "default": 2
      },
      {
        "id": "lineStyle",
        "title": "Line style",
        "kind": "enum",
        "writable": true,
        "choices": [
          "solid",
          "dashed",
          "dotted"
        ],
        "default": "solid"
      },
      {
        "id": "fillOpacity",
        "title": "Fill opacity",
        "kind": "number",
        "writable": true,
        "min": 0,
        "max": 1,
        "default": 0.19999999999999996
      },
      {
        "id": "visible",
        "title": "Visible",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "title",
        "title": "Title",
        "kind": "text",
        "writable": true,
        "maxLength": 100
      },
      {
        "id": "trendline.visible",
        "title": "Show trend line",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "extend.left",
        "title": "Extend left",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "extend.right",
        "title": "Extend right",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "fill.visible",
        "title": "Show fill",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "reverse",
        "title": "Reverse levels",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "labels.prices",
        "title": "Show level prices",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "labels.ratios",
        "title": "Show level values",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "labels.format",
        "title": "Level label format",
        "kind": "enum",
        "writable": true,
        "choices": [
          "values",
          "percents"
        ],
        "default": "values"
      },
      {
        "id": "label.horizontalAlign",
        "title": "Label horizontal alignment",
        "kind": "enum",
        "writable": true,
        "choices": [
          "left",
          "center",
          "right"
        ],
        "default": "left"
      },
      {
        "id": "label.verticalAlign",
        "title": "Label vertical alignment",
        "kind": "enum",
        "writable": true,
        "choices": [
          "top",
          "middle",
          "bottom"
        ],
        "default": "bottom"
      },
      {
        "id": "levels",
        "title": "Levels",
        "kind": "collection",
        "writable": true,
        "maxItems": 24,
        "item": [
          {
            "id": "coeff",
            "title": "Level value",
            "kind": "number",
            "writable": true,
            "min": -100,
            "max": 100
          },
          {
            "id": "color",
            "title": "Level color",
            "kind": "color",
            "writable": true
          },
          {
            "id": "visible",
            "title": "Level visible",
            "kind": "boolean",
            "writable": true
          }
        ]
      }
    ],
    "operations": [
      "create",
      "update",
      "delete",
      "group"
    ],
    "targets": [
      "main-series"
    ]
  },
  {
    "kind": "drawing",
    "id": "parallel_channel",
    "title": "Parallel Channel",
    "anchors": {
      "min": 3,
      "max": 3,
      "roles": [
        "time_price",
        "time_price",
        "time_price"
      ]
    },
    "fields": [
      {
        "id": "color",
        "title": "Color",
        "kind": "color",
        "writable": true,
        "default": "#2962ff"
      },
      {
        "id": "lineWidth",
        "title": "Line width",
        "kind": "integer",
        "writable": true,
        "min": 1,
        "max": 8,
        "unit": "px",
        "default": 2
      },
      {
        "id": "lineStyle",
        "title": "Line style",
        "kind": "enum",
        "writable": true,
        "choices": [
          "solid",
          "dashed",
          "dotted"
        ],
        "default": "solid"
      },
      {
        "id": "fillOpacity",
        "title": "Fill opacity",
        "kind": "number",
        "writable": true,
        "min": 0,
        "max": 1,
        "default": 0.2
      },
      {
        "id": "visible",
        "title": "Visible",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "title",
        "title": "Title",
        "kind": "text",
        "writable": true,
        "maxLength": 100
      },
      {
        "id": "text",
        "title": "Text",
        "kind": "text",
        "writable": true,
        "default": ""
      },
      {
        "id": "midline.show",
        "title": "Show middle line",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "midline.color",
        "title": "Middle line color",
        "kind": "color",
        "writable": true,
        "default": "#2962ff"
      },
      {
        "id": "midline.width",
        "title": "Middle line width",
        "kind": "integer",
        "writable": true,
        "min": 1,
        "max": 8,
        "unit": "px",
        "default": 1
      },
      {
        "id": "midline.style",
        "title": "Middle line style",
        "kind": "enum",
        "writable": true,
        "choices": [
          "solid",
          "dashed",
          "dotted"
        ],
        "default": "dashed"
      },
      {
        "id": "extend.left",
        "title": "Extend left",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "extend.right",
        "title": "Extend right",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "fill.visible",
        "title": "Show fill",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "fill.color",
        "title": "Fill color",
        "kind": "color",
        "writable": true,
        "default": "#2962ff"
      },
      {
        "id": "label.show",
        "title": "Show label",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.color",
        "title": "Label color",
        "kind": "color",
        "writable": true,
        "default": "#2962ff"
      },
      {
        "id": "label.fontSize",
        "title": "Label font size",
        "kind": "integer",
        "writable": true,
        "min": 8,
        "max": 48,
        "unit": "px",
        "default": 14
      },
      {
        "id": "label.bold",
        "title": "Label bold",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.italic",
        "title": "Label italic",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.horizontalAlign",
        "title": "Label horizontal alignment",
        "kind": "enum",
        "writable": true,
        "choices": [
          "left",
          "center",
          "right"
        ],
        "default": "left"
      },
      {
        "id": "label.verticalAlign",
        "title": "Label vertical alignment",
        "kind": "enum",
        "writable": true,
        "choices": [
          "top",
          "middle",
          "bottom"
        ],
        "default": "top"
      }
    ],
    "operations": [
      "create",
      "update",
      "delete",
      "group"
    ],
    "targets": [
      "main-series"
    ]
  },
  {
    "kind": "drawing",
    "id": "arrow",
    "title": "Arrow",
    "anchors": {
      "min": 2,
      "max": 2,
      "roles": [
        "time_price",
        "time_price"
      ]
    },
    "fields": [
      {
        "id": "color",
        "title": "Color",
        "kind": "color",
        "writable": true,
        "default": "#2962ff"
      },
      {
        "id": "lineWidth",
        "title": "Line width",
        "kind": "integer",
        "writable": true,
        "min": 1,
        "max": 8,
        "unit": "px",
        "default": 2
      },
      {
        "id": "lineStyle",
        "title": "Line style",
        "kind": "enum",
        "writable": true,
        "choices": [
          "solid",
          "dashed",
          "dotted"
        ],
        "default": "solid"
      },
      {
        "id": "text",
        "title": "Text",
        "kind": "text",
        "writable": true,
        "default": ""
      },
      {
        "id": "visible",
        "title": "Visible",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "title",
        "title": "Title",
        "kind": "text",
        "writable": true,
        "maxLength": 100
      },
      {
        "id": "extend.left",
        "title": "Extend left",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "extend.right",
        "title": "Extend right",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "end.left",
        "title": "Left end",
        "kind": "enum",
        "writable": true,
        "choices": [
          "normal",
          "arrow"
        ],
        "default": "normal"
      },
      {
        "id": "end.right",
        "title": "Right end",
        "kind": "enum",
        "writable": true,
        "choices": [
          "normal",
          "arrow"
        ],
        "default": "arrow"
      },
      {
        "id": "middlePoint.show",
        "title": "Show middle point",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "priceLabels.show",
        "title": "Show price labels",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "stats.priceRange",
        "title": "Show price range",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "stats.percentChange",
        "title": "Show percent change",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "stats.bars",
        "title": "Show bars range",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "stats.dateTime",
        "title": "Show date and time range",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "stats.distance",
        "title": "Show distance",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "stats.angle",
        "title": "Show angle",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.show",
        "title": "Show label",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.color",
        "title": "Label color",
        "kind": "color",
        "writable": true,
        "default": "#2962ff"
      },
      {
        "id": "label.fontSize",
        "title": "Label font size",
        "kind": "integer",
        "writable": true,
        "min": 8,
        "max": 48,
        "unit": "px",
        "default": 14
      },
      {
        "id": "label.bold",
        "title": "Label bold",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.italic",
        "title": "Label italic",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.horizontalAlign",
        "title": "Label horizontal alignment",
        "kind": "enum",
        "writable": true,
        "choices": [
          "left",
          "center",
          "right"
        ],
        "default": "center"
      },
      {
        "id": "label.verticalAlign",
        "title": "Label vertical alignment",
        "kind": "enum",
        "writable": true,
        "choices": [
          "top",
          "middle",
          "bottom"
        ],
        "default": "bottom"
      }
    ],
    "operations": [
      "create",
      "update",
      "delete",
      "group"
    ],
    "targets": [
      "main-series"
    ]
  },
  {
    "kind": "drawing",
    "id": "ellipse",
    "title": "Ellipse",
    "anchors": {
      "min": 3,
      "max": 3,
      "roles": [
        "time_price",
        "time_price",
        "time_price"
      ]
    },
    "fields": [
      {
        "id": "color",
        "title": "Color",
        "kind": "color",
        "writable": true,
        "default": "#f23645"
      },
      {
        "id": "lineWidth",
        "title": "Line width",
        "kind": "integer",
        "writable": true,
        "min": 1,
        "max": 8,
        "unit": "px",
        "default": 2
      },
      {
        "id": "fillOpacity",
        "title": "Fill opacity",
        "kind": "number",
        "writable": true,
        "min": 0,
        "max": 1,
        "default": 0.2
      },
      {
        "id": "text",
        "title": "Text",
        "kind": "text",
        "writable": true,
        "default": ""
      },
      {
        "id": "visible",
        "title": "Visible",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "title",
        "title": "Title",
        "kind": "text",
        "writable": true,
        "maxLength": 100
      },
      {
        "id": "fill.visible",
        "title": "Show fill",
        "kind": "boolean",
        "writable": true,
        "default": true
      },
      {
        "id": "fill.color",
        "title": "Fill color",
        "kind": "color",
        "writable": true,
        "default": "#f23645"
      },
      {
        "id": "label.show",
        "title": "Show label",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.color",
        "title": "Label color",
        "kind": "color",
        "writable": true,
        "default": "#f23645"
      },
      {
        "id": "label.bold",
        "title": "Label bold",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "label.italic",
        "title": "Label italic",
        "kind": "boolean",
        "writable": true,
        "default": false
      }
    ],
    "operations": [
      "create",
      "update",
      "delete",
      "group"
    ],
    "targets": [
      "main-series"
    ]
  },
  {
    "kind": "study",
    "id": "Moving Average@chart-studies-1",
    "title": "Moving Average",
    "placement": "overlay",
    "inputs": [
      {
        "id": "length",
        "title": "Length",
        "kind": "integer",
        "writable": true,
        "default": 9,
        "min": 1,
        "max": 10000
      },
      {
        "id": "source",
        "title": "Source",
        "kind": "enum",
        "writable": true,
        "default": "close",
        "choices": [
          "open",
          "high",
          "low",
          "close",
          "hl2",
          "hlc3",
          "ohlc4"
        ]
      },
      {
        "id": "offset",
        "title": "Offset",
        "kind": "integer",
        "writable": true,
        "default": 0,
        "min": -10000,
        "max": 10000
      }
    ],
    "plots": [
      {
        "id": "plot_0",
        "title": "Plot",
        "fields": [
          {
            "id": "color",
            "title": "Color",
            "kind": "color",
            "writable": true
          },
          {
            "id": "visible",
            "title": "Visible",
            "kind": "boolean",
            "writable": true
          },
          {
            "id": "width",
            "title": "Line width",
            "kind": "integer",
            "writable": true,
            "min": 1,
            "max": 8,
            "unit": "px"
          },
          {
            "id": "style",
            "title": "Line style",
            "kind": "enum",
            "writable": true,
            "choices": [
              "solid",
              "dashed",
              "dotted"
            ]
          }
        ]
      },
      {
        "id": "smoothedMA",
        "title": "Smoothed MA",
        "fields": [
          {
            "id": "color",
            "title": "Color",
            "kind": "color",
            "writable": true
          },
          {
            "id": "visible",
            "title": "Visible",
            "kind": "boolean",
            "writable": true
          },
          {
            "id": "width",
            "title": "Line width",
            "kind": "integer",
            "writable": true,
            "min": 1,
            "max": 8,
            "unit": "px"
          },
          {
            "id": "style",
            "title": "Line style",
            "kind": "enum",
            "writable": true,
            "choices": [
              "solid",
              "dashed",
              "dotted"
            ]
          }
        ]
      }
    ],
    "bands": [],
    "fills": []
  },
  {
    "kind": "study",
    "id": "Relative Strength Index@chart-studies-1",
    "title": "Relative Strength Index",
    "placement": "pane",
    "inputs": [
      {
        "id": "length",
        "title": "Length",
        "kind": "integer",
        "writable": true,
        "default": 14,
        "min": 1,
        "max": 2000
      }
    ],
    "plots": [
      {
        "id": "plot_0",
        "title": "Plot",
        "fields": [
          {
            "id": "color",
            "title": "Color",
            "kind": "color",
            "writable": true
          },
          {
            "id": "visible",
            "title": "Visible",
            "kind": "boolean",
            "writable": true
          },
          {
            "id": "width",
            "title": "Line width",
            "kind": "integer",
            "writable": true,
            "min": 1,
            "max": 8,
            "unit": "px"
          },
          {
            "id": "style",
            "title": "Line style",
            "kind": "enum",
            "writable": true,
            "choices": [
              "solid",
              "dashed",
              "dotted"
            ]
          }
        ]
      },
      {
        "id": "smoothedMA",
        "title": "Smoothed MA",
        "fields": [
          {
            "id": "color",
            "title": "Color",
            "kind": "color",
            "writable": true
          },
          {
            "id": "visible",
            "title": "Visible",
            "kind": "boolean",
            "writable": true
          },
          {
            "id": "width",
            "title": "Line width",
            "kind": "integer",
            "writable": true,
            "min": 1,
            "max": 8,
            "unit": "px"
          },
          {
            "id": "style",
            "title": "Line style",
            "kind": "enum",
            "writable": true,
            "choices": [
              "solid",
              "dashed",
              "dotted"
            ]
          }
        ]
      }
    ],
    "bands": [
      {
        "id": "hline_0",
        "title": "UpperLimit",
        "fields": [
          {
            "id": "value",
            "title": "Level",
            "kind": "number",
            "writable": true
          },
          {
            "id": "color",
            "title": "Color",
            "kind": "color",
            "writable": true
          },
          {
            "id": "visible",
            "title": "Visible",
            "kind": "boolean",
            "writable": true
          },
          {
            "id": "width",
            "title": "Line width",
            "kind": "integer",
            "writable": true,
            "min": 1,
            "max": 8,
            "unit": "px"
          },
          {
            "id": "style",
            "title": "Line style",
            "kind": "enum",
            "writable": true,
            "choices": [
              "solid",
              "dashed",
              "dotted"
            ]
          }
        ]
      },
      {
        "id": "hline_2",
        "title": "MiddleLimit",
        "fields": [
          {
            "id": "value",
            "title": "Level",
            "kind": "number",
            "writable": true
          },
          {
            "id": "color",
            "title": "Color",
            "kind": "color",
            "writable": true
          },
          {
            "id": "visible",
            "title": "Visible",
            "kind": "boolean",
            "writable": true
          },
          {
            "id": "width",
            "title": "Line width",
            "kind": "integer",
            "writable": true,
            "min": 1,
            "max": 8,
            "unit": "px"
          },
          {
            "id": "style",
            "title": "Line style",
            "kind": "enum",
            "writable": true,
            "choices": [
              "solid",
              "dashed",
              "dotted"
            ]
          }
        ]
      },
      {
        "id": "hline_1",
        "title": "LowerLimit",
        "fields": [
          {
            "id": "value",
            "title": "Level",
            "kind": "number",
            "writable": true
          },
          {
            "id": "color",
            "title": "Color",
            "kind": "color",
            "writable": true
          },
          {
            "id": "visible",
            "title": "Visible",
            "kind": "boolean",
            "writable": true
          },
          {
            "id": "width",
            "title": "Line width",
            "kind": "integer",
            "writable": true,
            "min": 1,
            "max": 8,
            "unit": "px"
          },
          {
            "id": "style",
            "title": "Line style",
            "kind": "enum",
            "writable": true,
            "choices": [
              "solid",
              "dashed",
              "dotted"
            ]
          }
        ]
      }
    ],
    "fills": [
      {
        "id": "fill_0",
        "title": "Hlines Background",
        "fields": [
          {
            "id": "color",
            "title": "Color",
            "kind": "color",
            "writable": true
          },
          {
            "id": "visible",
            "title": "Visible",
            "kind": "boolean",
            "writable": true
          }
        ]
      }
    ]
  },
  {
    "kind": "study",
    "id": "Moving Average Exponential@chart-studies-1",
    "title": "Moving Average Exponential",
    "placement": "overlay",
    "inputs": [
      {
        "id": "length",
        "title": "Length",
        "kind": "integer",
        "writable": true,
        "default": 9,
        "min": 1,
        "max": 10000
      },
      {
        "id": "source",
        "title": "Source",
        "kind": "enum",
        "writable": true,
        "default": "close",
        "choices": [
          "open",
          "high",
          "low",
          "close",
          "hl2",
          "hlc3",
          "ohlc4"
        ]
      },
      {
        "id": "offset",
        "title": "Offset",
        "kind": "integer",
        "writable": true,
        "default": 0,
        "min": -10000,
        "max": 10000
      }
    ],
    "plots": [
      {
        "id": "plot_0",
        "title": "Plot",
        "fields": [
          {
            "id": "color",
            "title": "Color",
            "kind": "color",
            "writable": true
          },
          {
            "id": "visible",
            "title": "Visible",
            "kind": "boolean",
            "writable": true
          },
          {
            "id": "width",
            "title": "Line width",
            "kind": "integer",
            "writable": true,
            "min": 1,
            "max": 8,
            "unit": "px"
          },
          {
            "id": "style",
            "title": "Line style",
            "kind": "enum",
            "writable": true,
            "choices": [
              "solid",
              "dashed",
              "dotted"
            ]
          }
        ]
      },
      {
        "id": "smoothedMA",
        "title": "Smoothed MA",
        "fields": [
          {
            "id": "color",
            "title": "Color",
            "kind": "color",
            "writable": true
          },
          {
            "id": "visible",
            "title": "Visible",
            "kind": "boolean",
            "writable": true
          },
          {
            "id": "width",
            "title": "Line width",
            "kind": "integer",
            "writable": true,
            "min": 1,
            "max": 8,
            "unit": "px"
          },
          {
            "id": "style",
            "title": "Line style",
            "kind": "enum",
            "writable": true,
            "choices": [
              "solid",
              "dashed",
              "dotted"
            ]
          }
        ]
      }
    ],
    "bands": [],
    "fills": []
  },
  {
    "kind": "study",
    "id": "Moving Average Convergence/Divergence@chart-studies-1",
    "title": "MACD",
    "placement": "pane",
    "inputs": [
      {
        "id": "fastLength",
        "title": "fastLength",
        "kind": "integer",
        "writable": true,
        "default": 12,
        "min": 1,
        "max": 2000
      },
      {
        "id": "slowLength",
        "title": "slowLength",
        "kind": "integer",
        "writable": true,
        "default": 26,
        "min": 1,
        "max": 2000
      },
      {
        "id": "signalLength",
        "title": "signalLength",
        "kind": "integer",
        "writable": true,
        "default": 9,
        "min": 1,
        "max": 50
      },
      {
        "id": "source",
        "title": "Source",
        "kind": "enum",
        "writable": true,
        "default": "close",
        "choices": [
          "open",
          "high",
          "low",
          "close",
          "hl2",
          "hlc3",
          "ohlc4"
        ]
      }
    ],
    "plots": [
      {
        "id": "plot_0",
        "title": "Histogram",
        "fields": [
          {
            "id": "palette",
            "title": "Palette colors",
            "kind": "collection",
            "writable": true,
            "maxItems": 4,
            "item": [
              {
                "id": "color",
                "title": "Color",
                "kind": "color",
                "writable": true
              }
            ]
          },
          {
            "id": "visible",
            "title": "Visible",
            "kind": "boolean",
            "writable": true
          }
        ]
      },
      {
        "id": "plot_1",
        "title": "MACD",
        "fields": [
          {
            "id": "color",
            "title": "Color",
            "kind": "color",
            "writable": true
          },
          {
            "id": "visible",
            "title": "Visible",
            "kind": "boolean",
            "writable": true
          },
          {
            "id": "width",
            "title": "Line width",
            "kind": "integer",
            "writable": true,
            "min": 1,
            "max": 8,
            "unit": "px"
          },
          {
            "id": "style",
            "title": "Line style",
            "kind": "enum",
            "writable": true,
            "choices": [
              "solid",
              "dashed",
              "dotted"
            ]
          }
        ]
      },
      {
        "id": "plot_2",
        "title": "Signal",
        "fields": [
          {
            "id": "color",
            "title": "Color",
            "kind": "color",
            "writable": true
          },
          {
            "id": "visible",
            "title": "Visible",
            "kind": "boolean",
            "writable": true
          },
          {
            "id": "width",
            "title": "Line width",
            "kind": "integer",
            "writable": true,
            "min": 1,
            "max": 8,
            "unit": "px"
          },
          {
            "id": "style",
            "title": "Line style",
            "kind": "enum",
            "writable": true,
            "choices": [
              "solid",
              "dashed",
              "dotted"
            ]
          }
        ]
      }
    ],
    "bands": [],
    "fills": []
  },
  {
    "kind": "study",
    "id": "Bollinger Bands@chart-studies-1",
    "title": "Bollinger Bands",
    "placement": "overlay",
    "inputs": [
      {
        "id": "length",
        "title": "length",
        "kind": "integer",
        "writable": true,
        "default": 20,
        "min": 1,
        "max": 10000
      },
      {
        "id": "multiplier",
        "title": "mult",
        "kind": "number",
        "writable": true,
        "default": 2,
        "min": 0.001,
        "max": 50
      }
    ],
    "plots": [
      {
        "id": "plot_0",
        "title": "Median",
        "fields": [
          {
            "id": "color",
            "title": "Color",
            "kind": "color",
            "writable": true
          },
          {
            "id": "visible",
            "title": "Visible",
            "kind": "boolean",
            "writable": true
          },
          {
            "id": "width",
            "title": "Line width",
            "kind": "integer",
            "writable": true,
            "min": 1,
            "max": 8,
            "unit": "px"
          },
          {
            "id": "style",
            "title": "Line style",
            "kind": "enum",
            "writable": true,
            "choices": [
              "solid",
              "dashed",
              "dotted"
            ]
          }
        ]
      },
      {
        "id": "plot_1",
        "title": "Upper",
        "fields": [
          {
            "id": "color",
            "title": "Color",
            "kind": "color",
            "writable": true
          },
          {
            "id": "visible",
            "title": "Visible",
            "kind": "boolean",
            "writable": true
          },
          {
            "id": "width",
            "title": "Line width",
            "kind": "integer",
            "writable": true,
            "min": 1,
            "max": 8,
            "unit": "px"
          },
          {
            "id": "style",
            "title": "Line style",
            "kind": "enum",
            "writable": true,
            "choices": [
              "solid",
              "dashed",
              "dotted"
            ]
          }
        ]
      },
      {
        "id": "plot_2",
        "title": "Lower",
        "fields": [
          {
            "id": "color",
            "title": "Color",
            "kind": "color",
            "writable": true
          },
          {
            "id": "visible",
            "title": "Visible",
            "kind": "boolean",
            "writable": true
          },
          {
            "id": "width",
            "title": "Line width",
            "kind": "integer",
            "writable": true,
            "min": 1,
            "max": 8,
            "unit": "px"
          },
          {
            "id": "style",
            "title": "Line style",
            "kind": "enum",
            "writable": true,
            "choices": [
              "solid",
              "dashed",
              "dotted"
            ]
          }
        ]
      }
    ],
    "bands": [],
    "fills": [
      {
        "id": "fill_0",
        "title": "Plots Background",
        "fields": [
          {
            "id": "color",
            "title": "Color",
            "kind": "color",
            "writable": true
          },
          {
            "id": "visible",
            "title": "Visible",
            "kind": "boolean",
            "writable": true
          }
        ]
      }
    ]
  },
  {
    "kind": "study",
    "id": "Average True Range@chart-studies-1",
    "title": "Average True Range",
    "placement": "pane",
    "inputs": [
      {
        "id": "length",
        "title": "length",
        "kind": "integer",
        "writable": true,
        "default": 14,
        "min": 1,
        "max": 2000
      }
    ],
    "plots": [
      {
        "id": "plot_0",
        "title": "Plot",
        "fields": [
          {
            "id": "color",
            "title": "Color",
            "kind": "color",
            "writable": true
          },
          {
            "id": "visible",
            "title": "Visible",
            "kind": "boolean",
            "writable": true
          },
          {
            "id": "width",
            "title": "Line width",
            "kind": "integer",
            "writable": true,
            "min": 1,
            "max": 8,
            "unit": "px"
          },
          {
            "id": "style",
            "title": "Line style",
            "kind": "enum",
            "writable": true,
            "choices": [
              "solid",
              "dashed",
              "dotted"
            ]
          }
        ]
      }
    ],
    "bands": [],
    "fills": []
  },
  {
    "kind": "chart",
    "id": "chart",
    "title": "Chart",
    "fields": [
      {
        "id": "chartType",
        "title": "Chart type",
        "kind": "enum",
        "writable": true,
        "default": "candle",
        "choices": [
          "bar",
          "candle",
          "hollow_candle",
          "column",
          "line",
          "line_with_markers",
          "step_line",
          "area",
          "hlc_area",
          "baseline",
          "hi_lo",
          "heikin_ashi",
          "volume_footprint"
        ]
      },
      {
        "id": "scale.mode",
        "title": "Price scale mode",
        "kind": "enum",
        "writable": true,
        "default": "normal",
        "choices": [
          "normal",
          "log",
          "percent",
          "indexed"
        ]
      },
      {
        "id": "scale.inverted",
        "title": "Invert price scale",
        "kind": "boolean",
        "writable": true,
        "default": false
      },
      {
        "id": "scale.autoScale",
        "title": "Auto scale",
        "kind": "boolean",
        "writable": true,
        "default": true
      }
    ]
  }
] as const satisfies readonly ChartCapability[];

/** Certified study IDs, in catalog order. */
export const CHART_STUDY_IDS = ["Moving Average@chart-studies-1","Relative Strength Index@chart-studies-1","Moving Average Exponential@chart-studies-1","Moving Average Convergence/Divergence@chart-studies-1","Bollinger Bands@chart-studies-1","Average True Range@chart-studies-1"] as const;
