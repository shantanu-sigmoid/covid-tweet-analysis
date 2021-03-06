// Top 10 preventive/precautionary measures suggested by WHO (World Health Organization) worldwide

db.who_tweets.aggregate([
{ $match: { "full_text": { $regex: "prevent.*|precaut.*", $options: "i" } } },
{ $limit: 10 }
])