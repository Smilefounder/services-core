#!/usr/local/bin/node
'use strict';

const {Client} = require('pg');
const pagarme = require('pagarme');
const getStdin = require('get-stdin');
const _ = require('lodash');

getStdin().then(str => {
    if(str !== null && str !== "") {
        init(JSON.parse(str))
            .then(void(0))
            .catch(void(0));
    }
});

async function init(stdin_data) {
    const exit = (code, message) => {
        console.log(message);
        process.exit(code);
    };
    const pg_client = new Client({
        connectionString: process.env.PROCESS_PAYMENT_DATABASE_URL,
        statement_timeout: 5000
    });
    await pg_client.connect();
    try {
        // fetch payment and user data to build context
        const res = await pg_client.query(
            `select
            row_to_json(cp.*) as payment_data,
            row_to_json(u.*) as user_data,
            row_to_json(p.*) as project_data,
            row_to_json(o.*) as project_owner_data,
            row_to_json(s.*) as subscription_data
        from payment_service.catalog_payments cp
            join community_service.users u on u.id = cp.user_id
            join project_service.projects p on p.id = cp.project_id
            join community_service.users o on o.id = p.user_id
            left join payment_service.subscriptions s on s.id = cp.subscription_id
            where cp.id = $1::uuid`
            , [stdin_data.id]);
        if(_.isEmpty(res.rows)) {
            exit(1, 'payment not found');
        }

        const payment = res.rows[0].payment_data;
        const user = res.rows[0].user_data;
        const project = res.rows[0].project_data;
        const project_owner = res.rows[0].project_owner_data;
        const subscription = res.rows[0].subscription_data;

        const pagarme_client = await pagarme.client.connect({
            api_key: process.env.GATEWAY_API_KEY
        });

        let customer = payment.data.customer;

        let af_address_data = {
            country: customer.address.country,
            state: customer.address.state,
            city: customer.address.city,
            zipcode: customer.address.zipcode,
            neighborhood: customer.address.neighbourhood,
            street: customer.address.street_number,
            street_number: customer.address.number,
            complementary: customer.address.complementary,
            latitude: '',
            longitude: ''
        };

        let transaction_data = {
            amount: payment.data.amount,
            payment_method: payment.data.payment_method,
            postback_url: process.env.POSTBACK_URL,
            async: false,
            customer: {
                name: customer.name,
                email: customer.email,
                document_number: customer.document_number,
                address: {
                    street: customer.address.street,
                    street_number: customer.address.street_number,
                    neighborhood: customer.address.neighborhood,
                    zipcode: customer.address.zipcode
                },
                phone: {
                    ddi: customer.phone.ddi,
                    ddd: customer.phone.ddd,
                    number: customer.phone.number
                }
            },
            metadata: {
                payment_id: payment.id,
                project_id: payment.project_id,
                platform_id: payment.platform_id,
                subscription_id: payment.subscription_id,
                user_id: payment.user_id,
                cataloged_at: payment.created_at
            },
            antifraud_metadata: {
                session_id: payment.id,
                ip: payment.data.current_ip,
                platform: "web",
                register: {
                    id: payment.user_id,
                    email: customer.email,
                    registered_at: user.created_at,
                    login_source: "registered",
                    company_group: "",
                    classification_code: ""
                },
                billing: {
                    customer: {
                        name: customer.name,
                        document_number: payment.data.credit_card_owner_document,
                        born_at: "",
                        gender: ""
                    },
                    address: af_address_data,
                    phone_numbers: [
                        {
                            ddi: customer.phone.ddi,
                            ddd: customer.phone.ddd,
                            number: customer.phone.number
                        }
                    ]
                },
                buyer: {
                    customer: {
                        name: customer.name,
                        document_number: customer.document_number,
                        born_at: "",
                        gender: ""
                    },
                    address: af_address_data,
                    phone_numbers: [{
                        ddi: customer.phone.ddi,
                        ddd: customer.phone.ddd,
                        number: customer.phone.number
                    }]
                },
                shipping: {
                    customer: {
                        name: customer.name,
                        document_number: customer.document_number,
                        bornt_at: "",
                        gender: ""
                    },
                    address: af_address_data,
                    phone_numbers: [{
                        ddi: customer.phone.ddi,
                        ddd: customer.phone.ddd,
                        number: customer.phone.number
                    }],
                    shipping_method: "",
                    fee: 0,
                    favorite: false
                },
                shopping_cart: [{
                    name: `${payment.data.amount/100.0} - ${project.data.name}`,
                    type: "contribution",
                    quantity: "1",
                    unit_price: payment.data.amount,
                    totalAdditions: 0,
                    totalDiscounts: 0,
                    event_id: project.id,
                    ticket_type_id: "0",
                    ticket_owner_name: customer.name,
                    ticket_owner_document_number: customer.document_number,
                }],
                discounts: [{
                    type: "other",
                    code: "",
                    amount: 0
                }],
                other_fees: [{
                    type: "",
                    amount: 0
                }],
                events: [{
                    id: project.id,
                    name: project.data.name,
                    type: project.mode === 'aon' ? 'full' : project.mode,
                    date: project.data.expires_at,
                    venue_name: project_owner.data.name,
                    address: {
                        country: "Brasil",
                        state: project_owner.data.address.state,
                        city: project_owner.data.address.city,
                        zipcode: project_owner.data.address.zipcode,
                        neighborhood: project_owner.data.address.neighborhood,
                        street: project_owner.data.address.street,
                        street_number: project_owner.data.address.street_number,
                        complementary: project_owner.data.address.complementary,
                        latitude: 0.0,
                        longitude: 0.0
                    },
                    ticket_types: [{
                        id: payment.id,
                        name: "",
                        type: "",
                        batch: "",
                        price: payment.data.amount,
                        available_number: 0,
                        total_number: 0,
                        identity_verified: "",
                        assigned_seats:  ""
                    }]
                }]
            }
        };

        if(payment.data.payment_method === 'credit_card') {
            let payment_charge = (payment.data.card_hash ? {
                card_hash: payment.data.card_hash
            } : {
                card_id: payment.data.card_id
            });

            _.extend(transaction_data, payment_charge);
        }

        try {
            const transaction = await pagarme_client.
                transactions.create(transaction_data);
            console.log('created transaction with id ',
                transaction.id);

            if (transaction.id) {
                const payables = await pagarme_client.
                    payables.find({ transactionId: transaction.id});

                const result_transaction_data = {
                    transaction: transaction,
                    payables: payables
                };

                // update payment with gateway payable and transaction data
                await pg_client.query(
                    `update payment_service.catalog_payments
                    set gateway_cached_data = $2::json,
                        gateway_general_data = payment_service.__extractor_for_pagarme($2::json) where id = $1::uuid`
                    , [
                        payment.id, 
                        JSON.stringify(result_transaction_data)
                    ]);

                // create credit card refence on db if save_card or subscriptions
                if(transaction.card && (payment.data.save_card || payment.subscription_id)) {
                    const saved_card_result = await pg_client.query(
                    `insert into payment_service.credit_cards(platform_id, user_id, gateway, gateway_data) values ($1::uuid, $2::uuid, 'pagarme', $3::jsonb) returning *`, [
                        payment.platform_id,
                        payment.user_id,
                        JSON.stringify(transaction.card)
                    ]);
                    const card = saved_card_result.rows[0];

                    //update subscription with credit card id
                    if(payment.subscription_id) {
                        await pg_client.query(
                            `update payment_service.subscriptions
                                set credit_card_id = $2::uuid
                                where id = $1::uuid
                            `, [payment.subscription_id, card.id]
                        );
                    }
                }
                // if transaction is not on initial state should transition payment to new state
                if (!_.includes(['processing', 'waiting_payment'], transaction.status)) {
                    await pg_client.query(
                        `select
                            payment_service.transition_to(p, ($2)::payment_service.payment_status, payment_service.__extractor_for_pagarme(($3)::json))
                        from payment_service.catalog_payments p
                        where p.id = ($1)::uuid
                    `, [
                        payment.id,
                        transaction.status,
                        JSON.stringify(result_transaction_data)
                    ]);

                    // if payment is paid or refused and have a subscription related should transition subscription to new status
                    if (payment.subscription_id) {
                        const transition_subscription_sql = `select payment_service.transition_to(s, ($2)::payment_service.subscription_status, payment_service.__extractor_for_pagarme(($3)::json))
                        from payment_service.subscriptions s where s.id = ($1)::uuid`;
                        // should active subscription when payment is paid
                        if(transaction.status === 'paid') {
                            await pg_client.query(
                                transition_subscription_sql,
                                [
                                    payment.subscription_id,
                                    'active',
                                    JSON.stringify(result_transaction_data)
                                ]
                            );
                        // should inactive subscription when refused andsubsciption is not started
                        } else if(tansaction.status === 'refused' && subscription.status !== 'started') {
                            const sub_transition = await pg_client.query(
                                transition_subscription_sql,
                                [
                                    payment.subscription_id,
                                    'inactive',
                                    JSON.stringify(result_transaction_data)
                                ]
                            );
                        }
                    }
                }
            } else {
                console.log('not charged on gateway');
                console.log(transaction);
            }
        } catch(err) {
            console.log(err);
            if(err.errors && err.response && err.response.errors) {
                await pg_client.query(
                    `update payment_service.catalog_payments
                    set gateway_cached_data = $2::json
                    where id = $1::uuid`
                    , [payment.id, JSON.stringify(err.response.errors)]);
                await pg_client.query(`
                        select
                            payment_service.transition_to(p, ($2)::payment_service.payment_status, payment_service.__extractor_for_pagarme(($3)::json))
                        from payment_service.catalog_payments p
                        where p.id = ($1)::uuid
                `, [payment.id, 'error', JSON.stringify(err.response.errors)]);

                console.log(JSON.stringify(err.response.errors));
            }
        }

        console.log('done');
    } catch (e) {
        console.log(e);
        exit(1, e);
    } finally {
        await pg_client.end();
    };
};
