//knockout-postbox v0.1.0 | (c) 2012 Ryan Niemeyer | http://www.opensource.org/licenses/mit-license
(function(ko, undefined) {
    var disposeTopicSubscription, existingSubscribe;

    //create a global postbox that supports subscribing/publishing
    ko.postbox = new ko.subscribable();
    //keep a cache of the latest value and subscribers
    ko.postbox.topicCache = {};

    //wrap notifySubscribers passing topic first and caching latest value
    ko.postbox.publish = function(topic, value) {
        if (topic) {
            //keep the value and a serialized version for comparison
            ko.postbox.topicCache[topic] = {
                value: value,
                serialized: ko.toJSON(value)
            };
            ko.postbox.notifySubscribers(value, topic);
        }
    };

    //provide a subscribe API for the postbox that takes in the topic as first arg
    existingSubscribe = ko.postbox.subscribe;
    ko.postbox.subscribe = function(topic, action, target) {
        if (topic) {
            return existingSubscribe.call(ko.postbox, action, target, topic);
        }
    };

    //by default publish when the previous cached value does not equal the new value
    ko.postbox.defaultComparer = function(newValue, cacheItem) {
        return newValue === cacheItem.value && ko.toJSON(newValue) === cacheItem.serialized;
    };

    //augment observables/computeds with the ability to automatically publish updates on a topic
    ko.subscribable.fn.publishOn = function(topic, skipInitialOrEqualityComparer, equalityComparer) {
        var skipInitialPublish;
        if (topic) {
            //allow passing the equalityComparer as the second argument
            if (typeof skipInitialOrEqualityComparer === "function") {
                equalityComparer = skipInitialOrEqualityComparer;
            } else {
                skipInitialPublish = skipInitialOrEqualityComparer;
            }

            equalityComparer = equalityComparer || ko.postbox.defaultComparer;

            //remove any existing subs
            disposeTopicSubscription.call(this, topic, "publishOn");

            //keep a reference to the subscription, so we can stop publishing
            this.postboxSubs[topic].publishOn = this.subscribe(function(newValue) {
                if (!equalityComparer.call(this, newValue, ko.postbox.topicCache[topic])) {
                    ko.postbox.publish(topic, newValue);
                }
            }, this);

            //do an initial publish
            if (!skipInitialPublish) {
                ko.postbox.publish(topic, this());
            }
        }

        return this;
    };

    //handle disposing a subscription used to publish or subscribe to a topic
    disposeTopicSubscription = function(topic, type) {
        var subs = this.postboxSubs = this.postboxSubs || {};
        subs[topic] = subs[topic] || {};

        if (subs[topic][type]) {
            subs[topic][type].dispose();
        }
    };

    //discontinue automatically publishing on a topic
    ko.subscribable.fn.stopPublishingOn = function(topic) {
        disposeTopicSubscription.call(this, topic, "publishOn");

        return this;
    };

    //augment observables/computeds to automatically be updated by notifications on a topic
    ko.subscribable.fn.subscribeTo = function(topic, initializeWithLatestValueOrTransform, transform) {
        var initializeWithLatestValue, current, callback,
            self = this;

        //allow passing the filter as the second argument
        if (typeof initializeWithLatestValueOrTransform === "function") {
            transform = initializeWithLatestValueOrTransform;
        } else {
            initializeWithLatestValue = initializeWithLatestValueOrTransform;
        }

        if (topic && ko.isWriteableObservable(this)) {
            //remove any existing subs
            disposeTopicSubscription.call(this, topic, "subscribeTo");

            //if specified, apply a filter function in the subscription
            callback = function(newValue) {
                self(transform ? transform.call(self, newValue) : newValue);
            };

            //keep a reference to the subscription, so we can unsubscribe, if necessary
            this.postboxSubs[topic].subscribeTo = ko.postbox.subscribe(topic, callback);

            if (initializeWithLatestValue) {
                current = ko.postbox.topicCache[topic];

                if (current !== undefined) {
                    callback(current.value);
                }
            }
        }

        return this;
    };

    //discontinue receiving updates on a topic
    ko.subscribable.fn.unsubscribeFrom = function(topic) {
        disposeTopicSubscription.call(this, topic, "subscribeTo");

        return this;
    };

    // both subscribe and publish on the same topic
    //   -allows the ability to sync an observable/writeable computed/observableArray between view models
    //   -subscribeTo should really not use a filter function, as it would likely cause infinite recursion
    ko.subscribable.fn.syncWith = function(topic, initializeWithLatestValue, skipInitialOrEqualityComparer, equalityComparer) {
        this.subscribeTo(topic, initializeWithLatestValue).publishOn(topic, skipInitialOrEqualityComparer, equalityComparer);

        return this;
    };
}(ko));
