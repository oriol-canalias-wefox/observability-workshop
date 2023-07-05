# Step by step

## Creating metrics

```kotlin
class MyService {
    private val log = LoggerFactory.getLogger(javaClass)

    fun sample() {
        val register = Counter.builder("my.sample")
            .description("My First counter")
            .tag("service", "myService")
            .register(SimpleMeterRegistry())
        register.increment()
        log.info("register: " + register.count())
    }
}
fun main() {
    val myService = MyService()
    myService.sample()
}
```
Run twice, doesn't work

```Kotlin
class MyService {
    private val log = LoggerFactory.getLogger(javaClass)
        val register = Counter.builder("my.sample")
            .description("My First counter")
            .tag("service", "myService")
            .register(SimpleMeterRegistry())

    fun sample() {
        register.increment()
        log.info("register: " + register.count())
    }
}

fun main() {
    val myService = MyService()
    myService.sample()
    myService.sample()
}
```

Add another class:
```kotlin
class MyService {
    private val log = LoggerFactory.getLogger(javaClass)
    val register = Counter.builder("my.sample")
        .description("My First counter")
        .tag("service", "myService")
        .register(SimpleMeterRegistry())

    fun sample() {
        register.increment()
        log.info("register: " + register.count())
    }
}

class MySecondService {
    private val log = LoggerFactory.getLogger(javaClass)
    val register = Counter.builder("my.sample")
        .description("My First counter")
        .tag("service", "myService")
        .register(SimpleMeterRegistry())

    fun sample() {
        register.increment()
        log.info("register: " + register.count())
    }
}

fun main() {
    val myService = MyService()
    myService.sample()
    val mySecondService = MySecondService()
    mySecondService.sample()
}
```

Using global registry:

```kotlin
class MyService {
    private val log = LoggerFactory.getLogger(javaClass)
    val register = Counter.builder("my.sample")
        .description("My First counter")
        .register(Metrics.globalRegistry)

    fun sample() {
        register.increment()
        log.info("register: " + register.count())
    }
}

class MySecondService {
    private val log = LoggerFactory.getLogger(javaClass)
    val register = Counter.builder("my.sample")
        .description("My First counter")
        .register(Metrics.globalRegistry)

    fun sample() {
        register.increment()
        log.info("register: " + register.count())
    }
}

fun main() {
    Metrics.globalRegistry.add(SimpleMeterRegistry())
    val myService = MyService()
    myService.sample()
    val mySecondService = MySecondService()
    mySecondService.sample()
}
```
Create a timer:
```kotlin
class MyService {
    private val log = LoggerFactory.getLogger(javaClass)
    val register = Counter.builder("my.sample")
        .description("My First counter")
        .tag("service", "myService")
        .register(Metrics.globalRegistry)
    val timer = Timer.builder("my.timer")
        .description("My first timer")
        .register(Metrics.globalRegistry)

    fun sample() {
        register.increment()
        timer.record(Runnable {
            Thread.sleep(100L)
            log.info("register: " + register.count())
        })
        log.info("timer: {} - {} - {}", timer.max(TimeUnit.MILLISECONDS),
            timer.mean(TimeUnit.MILLISECONDS),
            timer.totalTime(TimeUnit.MILLISECONDS))
    }
}

fun main() {
    Metrics.globalRegistry.add(SimpleMeterRegistry())
    val myService = MyService()
    myService.sample()
    myService.sample()
    myService.sample()
    myService.sample()
}
```
## Adding to Spring 

Create a controller.
Add properties to `application.yml` 
```yaml
management:
  endpoints:
    web:
      exposure:
        include: metrics, health
server:
  port: 1980
```

- http://localhost:1980/sample
- http://localhost:1980/actuator/metrics
- http://localhost:1980/actuator/metrics
- http://localhost:1980/actuator/metrics/my.sample

Using `@Observed`

add dependency: `implementation("org.springframework.boot:spring-boot-starter-aop")`

```kotlin
@Configuration
class MeterConfiguration {
    @Bean
    fun observedAspect(registry: ObservationRegistry): ObservedAspect {
        return ObservedAspect(registry)
    }
}
```


Using `@Timed`

```kotlin
    @Bean
    fun timedAspect(registry: MeterRegistry): TimedAspect {
        return TimedAspect(registry)
    }
```
---
## Expose prometheus metrics

Run Prometheus:
```bash
docker run --name local-prometheus -p 9090:9090 -v $(pwd)/config/prometheus:/etc/prometheus  -d prom/prometheus 
```
Run application test:
```bash
npm install
node ./index.js
```
- http://localhost:3010/metrics

Prometheus queries: 
- `total_requests`
- `increase(total_requests[1m])`
- Restart node app
- `total_requests`
- `increase(total_requests[1m])`
- `increase(total_requests[5m])`
- `sum(increase(total_requests[5m])) by (statusCode)`

```yaml
management:
  endpoints:
    web:
      exposure:
        include: metrics, health, prometheus
server:
  port: 1980
```

- http://localhost:1980/actuator/prometheus

See the configuration of targets, add the new one:
```yaml
- job_name: springBoot3
  metrics_path: /actuator/prometheus
  static_configs:
  - targets:
    - host.docker.internal:1980    
```

restart prometheus docker.


Let's generate more data:

```kotlin
@Component
@EnableScheduling
class RestJob {

    private val restTemplate = RestTemplate()

    @Scheduled(fixedRate = 500L)
    fun rest() {
        runCatching {
            restTemplate.getForEntity("http://localhost:1980/sample", String::class.java)
        }
    }
}
```
And add more information:
```kotlin
    @GetMapping
    @Observed(name = "my.controller")
    @Timed("my.timed.annotation", histogram = true)
    fun test(): String {
        val random = Random(System.currentTimeMillis())
        Thread.sleep(random.nextLong(100, 1_000))
        val status = random.nextLong(0, 10)
        if (status > 8) {
            throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR)
        }
        if (status > 7) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST)
        }
        myService.sample()
        return "OK"
    }
```
- `sum(increase(http_server_requests_seconds_count[5m])) by (status)`

Change the bad request frequency and restart



## PromQL

### Basics

- Instant vector: `http_server_requests_seconds_count`
- Range vector: `http_server_requests_seconds_count[1m]`
- Range vector(4m, interval 1m): `http_server_requests_seconds_count[4m:1m]`
- `http_server_requests_seconds_count{status="200"}`
- `http_server_requests_seconds_count{status=~"400|500"}`

### Counters
- per second: `rate(http_server_requests_seconds_count)` - Don't work, needs a range vector
- per second: `rate(http_server_requests_seconds_count[5m])`
- per minute: `rate(http_server_requests_seconds_count[5m])*60`
- `rate(http_server_requests_seconds_count[1m])*60` == `increase(http_server_requests_seconds_count[1m])`

### Gauges
- The value directly `logged_users_total`, can pick up just every 60 seconds

### Summary
- quantiles: `summary_request_duration_seconds`

### Histogram
- To infer the quantile from the histogram, we can use the function `histogram_quantile()`
    - `histogram_quantile(0.9, rate(my_timed_annotation_seconds_bucket{exception="none"}[10m]))`
    - for more than one instance, we need to aggregate them: `histogram_quantile(0.9, sum by (job, le) (rate(my_timed_annotation_seconds_bucket[10m])))`
- Sometimes, you have an SLA and want to see the % of requisitions that take less than this SLA
    - the SLA: `increase(my_timed_annotation_seconds_bucket{le="0.536870911"}[10m])`
    - the total: `increase(my_timed_annotation_seconds_count[10m])`
    - this doesn't work: `increase(my_timed_annotation_seconds_bucket{le="0.536870911"}[10m])/increase(my_timed_annotation_seconds_count[10m])` for the different labels
    - `sum(increase(my_timed_annotation_seconds_bucket{le="0.536870911"}[10m]))/sum(increase(my_timed_annotation_seconds_count[10m]))`

### Average
!!! For response time isn't a good metric
- `my_timed_annotation_seconds_sum/ my_timed_annotation_seconds_count` -> No scoped time, no variation
- `increase(my_timed_annotation_seconds_sum[5m])/increase(my_timed_annotation_seconds_count[5m])`

### Aggregation operators
Agrouping time series, discarding labels, unless you choose one label

- discarding other urls: `increase(http_server_requests_seconds_count{uri=~".sample(.*)"}[5m])`

---

## Grafana

```bash
docker run --name local-grafana --link local-prometheus:local-prometheus -p 3000:3000 -d grafana/grafana
```

- add prometheus as a datasource

- Explore: to run PromQL queries without save

- Create a dashboard, add panel for `logged_users_total` and configure the threshold
    - http://localhost:3010/reset-logged-users
    - http://localhost:3010/recovery-logged-users

- add panel for http request: `sum(rate(http_server_requests_seconds_count{uri="/sample"}[5m])) by (status)`
    - configure the type (opacity), play with the options 
    - Change to requistions x minutes, get more time between request, or less

- add histogram: `histogram_quantile(0.95, sum(rate(my_timed_annotation_seconds_bucket{exception="none"}[1m])) by (le))`
    - 95%, 90% and 75%
- Add rate error: `sum(rate(total_requests{statusCode!="200"}[1m]))/sum(rate(total_requests[1m]))*100`
- Value based on selection range: `sum(increase(total_requests[$__range]))`

### More functionalities

- copy statusCode panel
- paste in a new dashboard
- add new variable status - Getting from Prometheus
    - `sum(rate(http_server_requests_seconds_count{uri="/sample", status=~"$HttpStatusCode"}[5m])*60) by (status)`

- export to dashboard to import in production

- Import dashboard: https://grafana.com/grafana/dashboards/11378-justai-system-monitor/

### Alerts
- Create notification contact point webhook - https://webhook.site/
- Create an alert for http requests rate erros


