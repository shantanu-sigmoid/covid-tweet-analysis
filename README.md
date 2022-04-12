# Covid Tweet Analysis


# Problem Statement

[link](https://docs.google.com/document/d/1u7evaLRQ_CFOKFJSi0JniaaI_4hoxFYAyMqHrtSwFuY/edit)

# Architecture

![structure](./images/structure.png)

# Steps

## Step 1 - Environment Setup


1. Create New Project in IntelliJ with following versions
```python
sbt version = 1.6.2
JDK = 11 (Amazon Corretto) (java 8 to remove warnings)
scala version = 2.12.15
Spark Version = 3.2.1
Confluent Version = 7.0.1
```

2. Add Following script to `build.sbt`
```scala
ThisBuild / version := "0.1.0-SNAPSHOT"

ThisBuild / scalaVersion := "2.12.15"

// Spark
libraryDependencies += "org.apache.spark" %% "spark-core" % "3.2.1"
libraryDependencies += "org.apache.spark" %% "spark-streaming" % "3.2.1"
libraryDependencies += "org.apache.spark" %% "spark-sql" % "3.2.1"

// Twitter4j
libraryDependencies += "org.twitter4j" % "twitter4j-core" % "4.0.7"
libraryDependencies += "org.twitter4j" % "twitter4j-stream" % "4.0.7"
libraryDependencies += "org.apache.bahir" %% "spark-streaming-twitter" % "2.4.0"

// Mongo Spark
libraryDependencies += "org.mongodb.spark" %% "mongo-spark-connector" % "3.0.1"

// Kafka
libraryDependencies += "org.apache.spark" %% "spark-sql-kafka-0-10" % "3.2.1"

// Json
libraryDependencies += "com.typesafe.play" %% "play-json" % "2.9.2"

// HBC Java Client
libraryDependencies += "com.twitter" % "hbc-core" % "2.2.0"

// Akka
libraryDependencies ++= Seq(
  "com.typesafe.akka" %% "akka-actor"   % "2.6.19",
  "com.typesafe.akka" %% "akka-slf4j"   % "2.6.19",
  "com.typesafe.akka" %% "akka-remote"  % "2.6.19",
  "com.typesafe.akka" %% "akka-agent"   % "2.5.32",
  "com.typesafe.akka" %% "akka-testkit" % "2.6.19" % "test",
  "com.typesafe.akka" %% "akka-actor-typed" % "2.6.19",
  "com.typesafe.akka" %% "akka-actor-testkit-typed" % "2.6.19" % Test,
  "com.typesafe.akka" %% "akka-stream" % "2.6.19",
  "com.typesafe.akka" %% "akka-http" % "10.2.9"
)
lazy val root = (project in file("."))
  .settings(
    name := "covid-tweet-analysis"
  )

```

3. Start kafka and zookeeper with the following command:
### CONFLUENT 

**Installation:**
- Because kafka works only on 1.8 (really?), we need to give `JAVA_HOME` path to 1.8 version + PATH of `CONFLUENT_HOME` to confluent we just installed at location `/Users/shantanu/confluent-7.0.1`
```bash
# List out the java versions and their path
~ /usr/libexec/java_home -V

# > Output
Matching Java Virtual Machines (3):
    17.0.1 (arm64) "Oracle Corporation" - "Java SE 17.0.1" /Library/Java/JavaVirtualMachines/jdk-17.0.1.jdk/Contents/Home
    16.0.2 (x86_64) "Amazon.com Inc." - "Amazon Corretto 16" /Users/shantanu/Library/Java/JavaVirtualMachines/corretto-16.0.2/Contents/Home
    1.8.0_322 (x86_64) "Amazon" - "Amazon Corretto 8" /Users/shantanu/Library/Java/JavaVirtualMachines/corretto-1.8.0_322/Contents/Home

~ vi .zshrc
# NOW ADD BELOW 3 export into .zshrc

# Export Amazon corretto 8 which is 1.8 version of java 
~ export JAVA_HOME=/Users/shantanu/Library/Java/JavaVirtualMachines/corretto-1.8.0_322/Contents/Home

# For confluent to work (find stable solution)

# Set HOME For confluent
~ export CONFLUENT_HOME=/Users/shantanu/confluent-7.0.1

# Add to path (temporary ig)
~ export PATH=$PATH:$CONFLUENT_HOME/bin
```
**Setup:**
```bash
# Run confluent services
~ confluent local services start
```
Now go to localhost:9021 and create a topic `test-topic` with default settings
```bash
~ kafka-console-producer --broker-list localhost:9092 --topic test-topic
>{"name": "Shantanu", "age": 22, "gender": "Male"}
>{"name": "Bhavesh", "age":21, "gender": "Male"}
```
Open another terminal for consumer
```bash
~ kafka-console-consumer --bootstrap-server localhost:9092 --topic test-topic --from-beginning
>{"name": "Shantanu", "age": 22, "gender": "Male"}
>{"name": "Bhavesh", "age":21, "gender": "Male"}
```

```bash
# Stop service
~ confluent local services stop

# Delete the metadata
~ confluent local destroy
```
### BREW
```bash
# Prerequisite for kafka
~ brew install java

# Install kafka (upto 5 min)
~ brew install kafka

# List services
~ brew services list

# May require to uncomment last 2 line as showed below
~ vi /opt/homebrew/etc/kafka/server.properties
```

- Change the following in the file `/opt/homebrew/etc/kafka/server.properties`

```bash
# The address the socket server listens on. It will get the value returned from
# java.net.InetAddress.getCanonicalHostName() if not configured.
#   FORMAT:
#     listeners = listener_name://host_name:port
#   EXAMPLE:
#  listeners =PLAINTEXT://your.host.name:9092
listeners=PLAINTEXT://:9092
advertised.listeners=PLAINTEXT://localhost:9092
```
```zsh
# Start the services
~ brew services start zookeeper
~ brew services start kafka

# Create kafka topic
kafka-topics --create --topic test-topic --bootstrap-server localhost:9092 --replication-factor 1 --partitions 4

# Create producer console
~ kafka-console-producer --broker-list localhost:9092 --topic test-topic
> send first message
> send second message
> send third message

# Create consumer console in another terminal
~ kafka-console-consumer --bootstrap-server localhost:9092 --topic test-topic --from-beginning
send first message
send second message
send third message
```

## STEP 2: Data Ingest from Twitter to Kafka (Using HBC client)

`TwitterToKafka.scala`
```scala
import com.google.common.collect.Lists
import com.twitter.hbc.ClientBuilder
import com.twitter.hbc.core.Constants
import com.twitter.hbc.core.endpoint.StatusesFilterEndpoint
import com.twitter.hbc.core.processor.StringDelimitedProcessor
import com.twitter.hbc.httpclient.auth.OAuth1
import org.apache.kafka.clients.producer.{KafkaProducer, ProducerRecord}
import org.apache.kafka.common.serialization.StringSerializer
import org.apache.spark.sql.SparkSession

import java.util.Properties
import java.util.concurrent.{LinkedBlockingQueue, TimeUnit}


object TwitterToKafka {

  @throws[InterruptedException]
  def run(consumerKey: String, consumerSecret: String, token: String, secret: String): Unit = {
    val queue = new LinkedBlockingQueue[String](10000)
    val endpoint = new StatusesFilterEndpoint
    endpoint.trackTerms(Lists.newArrayList("covid", "virus"))
    val auth = new OAuth1(consumerKey, consumerSecret, token, secret)
    val client = new ClientBuilder()
      .name("sampleExampleClient")
      .hosts(Constants.STREAM_HOST)
      .endpoint(endpoint)
      .authentication(auth)
      .processor(new StringDelimitedProcessor(queue))
      .build
    client.connect()
    val kafkaProducerProps: Properties = {
      val props = new Properties()
      props.put("bootstrap.servers", "localhost:9092")
      props.put("key.serializer", classOf[StringSerializer].getName)
      props.put("value.serializer", classOf[StringSerializer].getName)
      props
    }
    val producer = new KafkaProducer[String, String](kafkaProducerProps)

    for (msgRead <- 0 until 10) {
        val msg =  queue.poll(5, TimeUnit.SECONDS)
        print(msg)
        if (msg != null) {
          producer.send(new ProducerRecord[String, String]("test-topic", null, msg))
        }
    }
    client.stop()
    println("The client read %d messages!\n", client.getStatsTracker.getNumMessages - 1)
  }

  def main(args: Array[String]): Unit = {
    val access_token: String="<your_access_token>"
    val access_token_secret: String="<your_access_token_secret>"
    val consumer_key: String="<your_consumer_key>"
    val consumer_secret: String="<your_consumer_secret>"
    try TwitterToKafka.run(consumer_key, consumer_secret, access_token, access_token_secret)
    catch {
      case e: InterruptedException =>
        System.out.println(e)
    }
  }
}

```

| **topic name** 	|                  **value**                 	|
|:--------------:	|:------------------------------------------:	|
| "key": "test-topic"     	| "value": { "$binary" : "eyJjcmVhdGVkX2F" } 	|
| "key": "test-topic"    	| "value": { "$binary" : "JadJjdafadDSFSF" } 	|


## STEP 3: Transform Data using Spark Streaming and Load to MongoDB

`KafkaToMongo.scala`
```scala
import org.apache.spark.SparkContext._
import org.apache.spark._
import org.apache.spark.sql.functions._
import org.apache.spark.sql.types._
import org.apache.spark.sql.{Column, DataFrame, SparkSession}
import org.apache.spark.streaming.StreamingContext._
import org.apache.spark.streaming._
import org.apache.spark.streaming.twitter._

import scala.util.parsing.json._

object KafkaToMongo {
  def replaceDotsForColName(name: String): String = {
    if(name.contains('.')){
      return name.replace(".", "_")
    }
    else{
      return name
    }
  }

  def main(args: Array[String]): Unit = {
    val spark = SparkSession.builder
                  .master("local")
                  .appName("demo")
                  .config("spark.mongodb.output.uri", "mongodb://localhost:27017")
                  .getOrCreate()
    import spark.implicits._
    val df = spark.readStream
                  .format("kafka")
                  .option("kafka.bootstrap.servers", "localhost:9092")
                  .option("subscribe", "test-topic")
                  .option("startingOffsets", "earliest")
                  .load()

    val raw_json: DataFrame = df.selectExpr("CAST(value AS STRING)")
    val columns: Seq[String] =  Seq(
      "created_at",
      "id",
      "text",
      "truncated",
      "user.name",
      "user.screen_name",
      "user.location",
      "geo",
      "coordinates",
      "place",
      "entities.hashtags",
      "lang"
    )
    val cleaned_columns: Seq[Column] = columns
          .map(c =>
            get_json_object($"value", s"$$.$c").alias(replaceDotsForColName(c))
          )
    val table: DataFrame = raw_json.select(cleaned_columns: _*)
    table.writeStream.foreachBatch { (batchDF: DataFrame, batchId: Long) =>
      batchDF.write
      .format("mongo")
      .mode("append")
      .option("database", "twitter_db")
      .option("collection", "covid_tweets")
      .save()
    }.start().awaitTermination()
  }
}

```
- Example Document in MongoDB

|   **KEY**  	|                 **VALUE**                	|
|----------	|----------------------------------------:	|
| _text_     	| _RT @RepThomasMassie: You’re at least 2_ 	|
| created_at 	| Wed Apr 06 15:55:03 +0000 2022           	|
| user_id    	| 980238526305460224                       	|

## STEP 4: Serve MongoDB data to Akka HTTP API on Localhost

`Server.scala`
```scala
import SparkMongo.{fetchAllJsonString, fetchQueryJsonString}
import akka.actor.ActorSystem
import akka.http.scaladsl.Http
import akka.http.scaladsl.model.{ContentTypes, HttpEntity}
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server._

import scala.concurrent.Await
import scala.concurrent.duration.Duration
object Server extends App {
 
  implicit val system: ActorSystem = ActorSystem("ProxySystem")
  val pipeline: String = "[{ $match: { user_location: { $exists: true } } }]"
  val route = pathPrefix("api"){
    concat(
      get{
        path("hello"){
          complete(HttpEntity(ContentTypes.`text/html(UTF-8)`, "<h1>Say hello to akka-http</h1>"))
        }
      },
      get{
        path("all"){
          complete(HttpEntity(ContentTypes.`application/json`, fetchAllJsonString()))
        }
      },
      get{
        path("query"){
          complete(HttpEntity(ContentTypes.`application/json`, fetchQueryJsonString(pipeline)))
        }
      }
    )
  }
  val bindingFuture = Http().newServerAt("127.0.0.1", port = 8080).bindFlow(route)
  Await.result(system.whenTerminated, Duration.Inf)

}
```

Go to `localhost:8080/api/all`

**Result**
```json
[
  {
    "_id": {
      "oid": "624dd4a49898fd74d9963671"
    },
    "created_at": "Wed Apr 06 15:30:55 +0000 2022",
    "entities_hashtags": "[]",
    "id": "1511728162857619458",
    "lang": "en",
    "text": "@oscarhumb @LangmanVince Yeah Biden is a piece of sh*t liar and a failure!\n\nWhat kind of stupidty does it take to b… https://t.co/L3p8ncFeFa",
    "truncated": "true",
    "user_location": "fabulous Las Vegas, NV",
    "user_name": "A Devoted Yogi",
    "user_screen_name": "ADevotedYogi"
  },
  {
    "_id": {
      "oid": "624dd4a49898fd74d9963672"
    },
    "created_at": "Wed Apr 06 15:30:55 +0000 2022",
    "entities_hashtags": "[]",
    "id": "1511728163168174093",
    "lang": "fr",
    "text": "RT @Belzeboule_: @mev479 @marc_2969 @ch_coulon L'abrogation du pass est dans le programme de Zemmour. Et c'est bien une abrogation, pas une…",
    "truncated": "false",
    "user_location": "Montauban, France",
    "user_name": "GUERMACHE BHARIA",
    "user_screen_name": "GuermacheBharia"
  }
]
```