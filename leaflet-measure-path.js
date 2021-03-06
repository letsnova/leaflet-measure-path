{
  L.Marker.Measurement = L[L.Layer ? 'Layer' : 'Class'].extend({
    options: {
      pane: 'markerPane'
    },
    initialize (latlng, measurement, title, rotation, options) {
      L.setOptions(this, options)

      this._latlng = latlng
      this._measurement = measurement
      this._title = title
      this._rotation = rotation
    },
    addTo (map, visible) {
      // Проверка на то, отображать лейбл или нет
      if (visible) {
        map.addLayer(this)
        return this
      }
    },

    onAdd (map) {
      this._map = map
      const pane = this.getPane ? this.getPane() : map.getPanes().markerPane
      const el = this._element = L.DomUtil.create('div', 'leaflet-zoom-animated leaflet-measure-path-measurement', pane)
      const inner = L.DomUtil.create('div', '', el)
      inner.title = this._title
      inner.innerHTML = this._measurement

      map.on('zoomanim', this._animateZoom, this)

      this._setPosition()
    },

    onRemove (map) {
      map.off('zoomanim', this._animateZoom, this)
      const pane = this.getPane ? this.getPane() : map.getPanes().markerPane
      pane.removeChild(this._element)
      this._map = null
    },

    _setPosition () {
      L.DomUtil.setPosition(this._element, this._map.latLngToLayerPoint(this._latlng))
      this._element.style.transform += ` rotate(${this._rotation}rad)`
    },

    _animateZoom (opt) {
      const pos = this._map._latLngToNewLayerPoint(this._latlng, opt.zoom, opt.center).round()
      L.DomUtil.setPosition(this._element, pos)
      this._element.style.transform += ` rotate(${this._rotation}rad)`
    }
  })

  L.marker.measurement = (latLng, measurement, title, rotation, options) => {
    return new L.Marker.Measurement(latLng, measurement, title, rotation, options)
  }

  const formatDistance = function (d) {
    let unit, feet

    if (this._measurementOptions.imperial) {
      feet = d / 0.3048
      if (feet > 3000) {
        d = d / 1609.344
        unit = 'mi'
      } else {
        d = feet
        unit = 'ft'
      }
    } else {
      if (d > 1000) {
        d = d / 1000
        unit = 'km'
      } else {
        unit = 'm'
      }
    }

    if (d < 100) {
      return `${d.toFixed(1)} ${unit}`
    } else {
      return `${Math.round(d)} ${unit}`
    }
  }

  const formatArea = function (a) {
    let unit, sqfeet

    if (this._measurementOptions.imperial) {
      if (a > 404.685642) {
        a = a / 4046.85642
        unit = 'ac'
      } else {
        a = a / 0.09290304
        unit = 'ft²'
      }
    } else {
      if (a > 1000000) {
        a = a / 1000000
        unit = 'km²'
      } else {
        unit = 'm²'
      }
    }

    if (a < 100) {
      return `${a.toFixed(1)} ${unit}`
    } else {
      return `${Math.round(a)} ${unit}`
    }
  }

  // Радиус земли для соответствия с нашими вычислениями
  const RADIUS = 6371000
  // ringArea function copied from geojson-area
  // (https://github.com/mapbox/geojson-area)
  // This function is distributed under a separate license,
  // see LICENSE.md.
  const ringArea = function ringArea (coords) {
    const rad = function rad (_) {
      return _ * Math.PI / 180
    }
    let p1
    let p2
    let p3
    let lowerIndex
    let middleIndex
    let upperIndex
    let area = 0
    const coordsLength = coords.length

    if (coordsLength > 2) {
      for (let i = 0; i < coordsLength; i++) {
        if (i === coordsLength - 2) { // i = N-2
          lowerIndex = coordsLength - 2
          middleIndex = coordsLength - 1
          upperIndex = 0
        } else if (i === coordsLength - 1) { // i = N-1
          lowerIndex = coordsLength - 1
          middleIndex = 0
          upperIndex = 1
        } else { // i = 0 to N-3
          lowerIndex = i
          middleIndex = i + 1
          upperIndex = i + 2
        }
        p1 = coords[lowerIndex]
        p2 = coords[middleIndex]
        p3 = coords[upperIndex]
        area += (rad(p3.lng) - rad(p1.lng)) * Math.sin(rad(p2.lat))
      }

      area = area * RADIUS * RADIUS / 2
    }

    return Math.abs(area)
  }
  /**
   * Handles the init hook for polylines and circles.
   * Implements the showOnHover functionality if called for.
   */
  const addInitHook = function () {
    const showOnHover = this.options.measurementOptions && this.options.measurementOptions.showOnHover
    if (this.options.showMeasurements && !showOnHover) {
      this.showMeasurements()
    }
    if (this.options.showMeasurements && showOnHover) {
      this.on('mouseover', function () {
        this.showMeasurements()
      })
      this.on('mouseout', function () {
        this.hideMeasurements()
      })
    }
  }

  const circleArea = function circleArea (d) {
    const rho = d / RADIUS
    return 2 * Math.PI * RADIUS * RADIUS * (1 - Math.cos(rho))
  }

  const override = (method, fn, hookAfter) => {
    if (!hookAfter) {
      return function () {
        const originalReturnValue = method.apply(this, arguments)
        const args = Array.prototype.slice.call(arguments)
        args.push(originalReturnValue)
        return fn.apply(this, args)
      }
    } else {
      return function (...args) {
        fn.apply(this, args)
        return method.apply(this, args)
      }
    }
  }

  // Функция расчета расстояния между двумя точками
  const distanceTo = function (latlng1, latlng2) {
    var rad = Math.PI / 180,
      dlat = latlng2.lat - latlng1.lat,
      dlon = latlng2.lng - latlng1.lng,
      x = Math.cos(Math.PI * (latlng2.lat + latlng1.lat) / 360),
      c = rad * Math.sqrt(dlat * dlat + dlon * dlon * x * x )
    return RADIUS * c;
  }

  L.Polyline.include({
    showMeasurements (options) {
      if (!this._map || this._measurementLayer) return this

      this._measurementOptions = L.extend({
        measureName: null,
        defaultMeasureName: null,
        showOnHover: (options && options.showOnHover) || false,
        minPixelDistance: 30,
        showDistances: true,
        showArea: true,
        lang: {
          totalLength: 'Total length',
          totalArea: 'Total area',
          segmentLength: 'Segment length',
          lineName: 'Line name',
          polygonName: 'Polygon name',
          markername: 'Marker name'
        }
      }, options || {})

      this._measurementLayer = L.layerGroup().addTo(this._map, true)
      this.updateMeasurements()

      this._map.on('zoomend', this.updateMeasurements, this)

      return this
    },

    hideMeasurements () {
      if (!this._map) return this

      this._map.off('zoomend', this.updateMeasurements, this)

      if (!this._measurementLayer) return this
      this._map.removeLayer(this._measurementLayer)
      this._measurementLayer = null

      return this
    },

    onAdd: override(L.Polyline.prototype.onAdd, function (originalReturnValue) {
      const showOnHover = this.options.measurementOptions && this.options.measurementOptions.showOnHover
      if (this.options.showMeasurements && !showOnHover) {
        this.showMeasurements(this.options.measurementOptions)
      }

      return originalReturnValue
    }),

    onRemove: override(L.Polyline.prototype.onRemove, function (originalReturnValue) {
      this.hideMeasurements()

      return originalReturnValue
    }, true),

    setLatLngs: override(L.Polyline.prototype.setLatLngs, function (originalReturnValue) {
      this.updateMeasurements()

      return originalReturnValue
    }),

    spliceLatLngs: override(L.Polyline.prototype.spliceLatLngs, function (originalReturnValue) {
      this.updateMeasurements()

      return originalReturnValue
    }),

    formatDistance,
    formatArea,

    updateMeasurements () {
      if (!this._measurementLayer) return this

      let latLngs = this.getLatLngs()
      const isPolygon = this instanceof L.Polygon
      const options = this._measurementOptions
      let totalDist = 0
      let formatter
      let ll1
      let ll2
      let p1
      let p2
      let pixelDist
      let dist
      // Отображение лейбла названия
      this.showName = this._measurementOptions.showName
      // Отображение леблов замеров
      this.showMeasures = this._measurementOptions.showMeasures
      // Массив расстояний между двумя точками
      this._measurementLayer.options.dist = []

      if (latLngs && latLngs.length && L.Util.isArray(latLngs[0])) {
        // Outer ring is stored as an array in the first element,
        // use that instead.
        latLngs = latLngs[0]
      }

      this._measurementLayer.clearLayers()

      if (this._measurementOptions.showDistances && latLngs.length > 2) {
        formatter = this._measurementOptions.formatDistance || L.bind(this.formatDistance, this)

        for (let i = 1, len = latLngs.length; (isPolygon && i <= len) || i < len; i++) {
          ll1 = latLngs[i - 1]
          ll2 = latLngs[i % len]
          dist = distanceTo(ll1, ll2)
          this._measurementLayer.options.dist.push({
            distance: dist,
            a: latLngs[i - 1],
            b: latLngs[i % len]
          })
          totalDist += dist

          p1 = this._map.latLngToLayerPoint(ll1)
          p2 = this._map.latLngToLayerPoint(ll2)

          pixelDist = p1.distanceTo(p2)
          if (pixelDist >= options.minPixelDistance) {
            L.marker.measurement(
              this._map.layerPointToLatLng([(p1.x + p2.x) / 2, (p1.y + p2.y) / 2]),
              // for rotate labels
              // formatter(dist), options.lang.segmentLength, this._getRotation(ll1, ll2), options)
              formatter(dist), options.lang.segmentLength, 0, options)
              .addTo(this._measurementLayer, this.showMeasures)
          }
        }
        // Длина всех линий замера
        this._measurementLayer.options.totalDist = totalDist

        // Show total length for polylines
        if (!isPolygon) {
          // add measurement name to line
          if (options.measureName !== null || options.defaultMeasureName !== null) {
            L.marker.measurement(latLngs[0], (options.measureName ? options.measureName : options.defaultMeasureName), options.lang.lineName, 0, options)
              .addTo(this._measurementLayer, this.showName)
          }
          L.marker.measurement(ll2, formatter(totalDist), options.lang.totalLength, 0, options)
            .addTo(this._measurementLayer, this.showMeasures)
        }
      } else {
        formatter = this._measurementOptions.formatDistance || L.bind(this.formatDistance, this)

        for (let i = 1, len = latLngs.length; i < len; i++) {
          ll1 = latLngs[i - 1]
          ll2 = latLngs[i % len]
          dist = distanceTo(ll1, ll2)
          this._measurementLayer.options.dist.push({
            distance: dist,
            a: latLngs[i - 1],
            b: latLngs[i % len]
          })
          totalDist += dist

          p1 = this._map.latLngToLayerPoint(ll1)
          p2 = this._map.latLngToLayerPoint(ll2)

        }
        // Общая длина всех линий замера
        this._measurementLayer.options.totalDist = totalDist
        // add measurement name to line
        if (options.measureName !== null || options.defaultMeasureName !== null) {
          L.marker.measurement(latLngs[0], (options.measureName ? options.measureName : options.defaultMeasureName), options.lang.lineName, 0, options)
            .addTo(this._measurementLayer, this.showName)
        }
        L.marker.measurement(ll2, formatter(totalDist), options.lang.totalLength, 0, options)
          .addTo(this._measurementLayer, this.showMeasures)
      }

      if (isPolygon && options.showArea && latLngs.length > 2) {
        formatter = options.formatArea || L.bind(this.formatArea, this)
        const area = ringArea(latLngs)
        // Плозадь замера
        this._measurementLayer.options.area = area
        L.marker.measurement(this.getBounds().getCenter(),
          formatter(area), options.lang.totalArea, 0, options)
          .addTo(this._measurementLayer, this.showMeasures)
        // add measurement name to polygon
        if (options.measureName !== null || options.defaultMeasureName !== null) {
          L.marker.measurement(latLngs[0], (options.measureName ? options.measureName : options.defaultMeasureName), options.lang.polygonName, 0, options)
            .addTo(this._measurementLayer, this.showName)
        }
      }

      return this
    },

    _getRotation (ll1, ll2) {
      const p1 = this._map.project(ll1); const p2 = this._map.project(ll2)

      return Math.atan((p2.y - p1.y) / (p2.x - p1.x))
    }
  })

  L.Polyline.addInitHook(function () {
    addInitHook.call(this)
  })

  L.Circle.include({
    showMeasurements (options) {
      if (!this._map || this._measurementLayer) return this

      this._measurementOptions = L.extend({
        measureName: null,
        defaultMeasureName: null,
        showOnHover: false,
        showArea: true,
        lang: {
          totalLength: 'Total length',
          totalArea: 'Total area',
          segmentLength: 'Segment length',
          lineName: 'Line name',
          polygonName: 'Polygon name',
          markername: 'Marker name'
        }
      }, options || {})

      this._measurementLayer = L.layerGroup().addTo(this._map, true)
      this.updateMeasurements()

      this._map.on('zoomend', this.updateMeasurements, this)

      return this
    },

    hideMeasurements () {
      if (!this._map) return this

      this._map.on('zoomend', this.updateMeasurements, this)

      if (!this._measurementLayer) return this
      this._map.removeLayer(this._measurementLayer)
      this._measurementLayer = null

      return this
    },

    onAdd: override(L.Circle.prototype.onAdd, function (originalReturnValue) {
      const showOnHover = this.options.measurementOptions && this.options.measurementOptions.showOnHover
      if (this.options.showMeasurements && !showOnHover) {
        this.showMeasurements(this.options.measurementOptions)
      }

      return originalReturnValue
    }),

    onRemove: override(L.Circle.prototype.onRemove, function (originalReturnValue) {
      this.hideMeasurements()

      return originalReturnValue
    }, true),

    setLatLng: override(L.Circle.prototype.setLatLng, function (originalReturnValue) {
      this.updateMeasurements()

      return originalReturnValue
    }),

    setRadius: override(L.Circle.prototype.setRadius, function (originalReturnValue) {
      this.updateMeasurements()

      return originalReturnValue
    }),

    formatArea,

    updateMeasurements () {
      if (!this._measurementLayer) return

      const latLng = this.getLatLng()
      const options = this._measurementOptions
      let formatter = options.formatArea || L.bind(this.formatArea, this)
      // Отображение лейбла названия
      this.showName = this._measurementOptions.showName
      // Отображение лейблов длин и площадей
      this.showMeasures = this._measurementOptions.showMeasures

      this._measurementLayer.clearLayers()

      if (options.showArea) {
        formatter = options.formatArea || L.bind(this.formatArea, this)
        const area = circleArea(this.getRadius())
        // Площадь круга
        this._measurementLayer.options.area = area
        L.marker.measurement(latLng,
          formatter(area), options.lang.totalArea, 0, options)
          .addTo(this._measurementLayer, this.showMeasures)
      }

      if (options.measureName !== null || options.defaultMeasureName !== null) {
        const LABEL_OFFSET = 35

        let pointMarker = this._map.latLngToContainerPoint(latLng)
        let markerPosition = L.point([pointMarker.x, pointMarker.y + LABEL_OFFSET])
        let position = this._map.containerPointToLatLng(markerPosition)

        L.marker.measurement(position,
          (options.measureName ? options.measureName : options.defaultMeasureName), options.lang.lineName, 0, options)
          .addTo(this._measurementLayer, this.showName)
      }
    }
  })

  L.Circle.addInitHook(function () {
    addInitHook.call(this)
  })

  // Функционал отображения названия маркера
  L.Marker.include({
    showMeasurements (options) {
      if (!this._map || this._measurementLayer) return this

      this._measurementOptions = L.extend({
        measureName: null,
        defaultMeasureName: null,
        showOnHover: false,
        showArea: false,
        lang: {
          totalLength: 'Total length',
          totalArea: 'Total area',
          segmentLength: 'Segment length',
          lineName: 'Line name',
          polygonName: 'Polygon name',
          markername: 'Marker name'
        }
      }, options || {})

      this._measurementLayer = L.layerGroup().addTo(this._map, true)
      this.updateMeasurements()

      this._map.on('zoomend', this.updateMeasurements, this)

      return this
    },

    hideMeasurements () {
      if (!this._map) return this

      this._map.on('zoomend', this.updateMeasurements, this)

      if (!this._measurementLayer) return this
      this._map.removeLayer(this._measurementLayer)
      this._measurementLayer = null

      return this
    },

    onAdd: override(L.Marker.prototype.onAdd, function (originalReturnValue) {
      const showOnHover = this.options.measurementOptions && this.options.measurementOptions.showOnHover
      if (this.options.showMeasurements && !showOnHover) {
        this.showMeasurements(this.options.measurementOptions)
      }

      return originalReturnValue
    }),

    onRemove: override(L.Marker.prototype.onRemove, function (originalReturnValue) {
      this.hideMeasurements()

      return originalReturnValue
    }, true),

    setLatLng: override(L.Marker.prototype.setLatLng, function (originalReturnValue) {
      this.updateMeasurements()

      return originalReturnValue
    }),

    updateMeasurements () {
      if (!this._measurementLayer) return

      const latLng = this.getLatLng()
      const options = this._measurementOptions

      this._measurementLayer.clearLayers()
      // Отображение лейбла названия
      this.showName = this._measurementOptions.showName

      if (options.measureName !== null || options.defaultMeasureName !== null) {
        const LABEL_OFFSET = 15

        let pointMarker = this._map.latLngToContainerPoint(latLng)
        let markerPosition = L.point([pointMarker.x, pointMarker.y + LABEL_OFFSET])
        let position = this._map.containerPointToLatLng(markerPosition)

        L.marker.measurement(position,
          (options.measureName ? options.measureName : options.defaultMeasureName), options.lang.markerName, 0, options)
          .addTo(this._measurementLayer, this.showName)
      }
    }
  })

  L.Marker.addInitHook(function () {
    addInitHook.call(this)
  })
}
